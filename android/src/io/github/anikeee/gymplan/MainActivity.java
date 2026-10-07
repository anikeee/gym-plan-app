package io.github.anikeee.gymplan;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Shows the live workout plan site, so the app updates whenever the site does.
 * The site's service worker keeps it working without signal after the first open.
 * Links that leave the site (YouTube, PureGym guides) open in their own apps.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://anikeee.github.io/gym-plan-app/";
    private static final String HOST = "anikeee.github.io";
    private static final String PATH = "/gym-plan-app";

    // Shown only when the very first open has no signal. After one good load the site's service worker serves it offline.
    private static final String OFFLINE_PAGE = "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        + "<meta name='viewport' content='width=device-width, initial-scale=1'><style>"
        + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E0F12;color:#F3F4F6;font-family:sans-serif;text-align:center}"
        + "main{padding:32px;max-width:320px}h1{font-size:26px;margin:0 0 12px}"
        + "p{margin:0 0 28px;color:#A1A8B3;font-size:16px;line-height:1.5}"
        + "a{display:inline-block;min-height:24px;padding:14px 28px;border-radius:14px;background:#C6F432;color:#0E0F12;font-weight:700;text-decoration:none}"
        + "</style></head><body><main><h1>No connection</h1>"
        + "<p>Open the workout plan once with internet. After that it works without signal.</p>"
        + "<a href='" + HOME + "'>Try again</a></main></body></html>";

    private WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0E0F12")); // no white flash before the page paints
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // the page remembers the last opened day in localStorage
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isOwnPage(uri)) return false;
                openOutside(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Android's own error page is dark text on this dark background, so show a readable one instead.
                if (request.isForMainFrame()) view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null);
            }
        });
        setContentView(web);
        if (saved == null || web.restoreState(saved) == null) web.loadUrl(HOME);
    }

    static boolean isOwnPage(Uri uri) {
        String path = uri.getPath();
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && path != null && path.startsWith(PATH);
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // No app on this phone can open the link. Staying on the page beats crashing.
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
