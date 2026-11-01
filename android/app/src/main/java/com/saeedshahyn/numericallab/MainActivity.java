package com.saeedshahyn.numericallab;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Hosts only bundled lab assets; external links open in the user's browser. */
public final class MainActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/index.html";
    private static final int SAVE_CSV = 401;
    private FrameLayout root;
    private WebView webView;
    private byte[] pendingCsv;
    private boolean showingError;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        boolean dark = (getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        root.setBackgroundColor(Color.parseColor(dark ? "#101713" : "#f6f7f2"));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new CsvExport(), "AndroidDownloads");

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (isBundled(request.getUrl())) {
                    WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                    if (response != null) return response;
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isBundled(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture()
                    && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) {
                        Toast.makeText(MainActivity.this, R.string.no_browser, Toast.LENGTH_SHORT).show();
                    }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                root.removeView(view);
                view.destroy();
                webView = null;
                showLoadError();
                return true;
            }
        });
        webView.loadUrl(HOME);
        root.requestApplyInsets();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private static boolean isBundled(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
            && "appassets.androidplatform.net".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private void handleBack() {
        if (webView == null) { finish(); return; }
        webView.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');"
            + "if(d){d.close();return true;}return false;})()", closed -> {
                if ("true".equals(closed)) return;
                if (webView != null && webView.canGoBack()) webView.goBack(); else finish();
            });
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { handleBack(); }

    private void showLoadError() {
        runOnUiThread(() -> {
            if (showingError || isFinishing()) return;
            showingError = true;
            if (webView != null) webView.setVisibility(View.GONE);
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setPadding(32, 48, 32, 32);
            TextView message = new TextView(this);
            message.setText(R.string.load_error);
            box.addView(message);
            Button retry = new Button(this);
            retry.setText(R.string.retry);
            retry.setOnClickListener(v -> recreate());
            box.addView(retry);
            root.addView(box);
        });
    }

    public final class CsvExport {
        @JavascriptInterface public void saveCsv(String content, String requestedName) {
            if (content == null || content.length() > 1_000_000) return;
            String safe = requestedName == null ? "numerical-lab.csv"
                : requestedName.replaceAll("[^a-zA-Z0-9._-]", "_");
            if (safe.length() > 96) safe = safe.substring(0, 96);
            if (!safe.endsWith(".csv")) safe += ".csv";
            final String filename = safe;
            runOnUiThread(() -> {
                if (webView == null || !isBundled(Uri.parse(webView.getUrl() == null ? "" : webView.getUrl()))
                    || pendingCsv != null) return;
                pendingCsv = content.getBytes(StandardCharsets.UTF_8);
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("text/csv");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(intent, SAVE_CSV); }
                catch (ActivityNotFoundException error) {
                    pendingCsv = null;
                    Toast.makeText(MainActivity.this, R.string.save_error, Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != SAVE_CSV) return;
        byte[] bytes = pendingCsv;
        pendingCsv = null;
        if (result != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
        try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
            if (output == null) throw new IOException("No output stream");
            output.write(bytes);
            Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show();
        } catch (IOException | SecurityException error) {
            Toast.makeText(this, R.string.save_error, Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }
    @Override protected void onDestroy() {
        pendingCsv = null;
        if (webView != null) {
            root.removeView(webView);
            webView.removeJavascriptInterface("AndroidDownloads");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
