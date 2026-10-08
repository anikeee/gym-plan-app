package io.github.anikeee.gymplan;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

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

    private static final int EXPORT_REQ = 41;
    private static final int IMPORT_REQ = 42;
    private static final String EXPORT_CACHE = "export.json";

    private WebView web;
    // The page's file input waits on this. It must be answered exactly once, or the input never works again.
    private ValueCallback<Uri[]> pendingImport;
    // One export at a time: a second tap while the picker opens would share the stash, and the first result would delete it.
    private final AtomicBoolean exportPending = new AtomicBoolean();
    // The last backup result, kept until the page takes it, because a page that is still loading can't hear the event.
    private final AtomicReference<String> backupResult = new AtomicReference<>();

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
        // Import: WebView ignores <input type=file> unless the app opens a picker. "*/*" because pickers often
        // grey out .json files when filtered by type; the page checks the content itself.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingImport != null) pendingImport.onReceiveValue(null);
                pendingImport = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(pick, IMPORT_REQ);
                } catch (ActivityNotFoundException e) {
                    pendingImport.onReceiveValue(null);
                    pendingImport = null;
                }
                return true;
            }
        });
        // Export: WebView ignores downloads of the page's backup file, so the page hands the text to the app.
        web.addJavascriptInterface(new Bridge(), "WorkoutPlanApp");
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

    /** Called from the page as window.WorkoutPlanApp.saveFile(name, text). Runs on a WebView thread. */
    final class Bridge {
        @JavascriptInterface
        public void saveFile(String fileName, String text) {
            if (!exportPending.compareAndSet(false, true)) return; // a second tap while the picker is opening
            // Kept in a file, not in memory, so the backup survives Android closing the app while the picker is open.
            File stash = new File(getCacheDir(), EXPORT_CACHE);
            try (Writer w = new OutputStreamWriter(new FileOutputStream(stash), StandardCharsets.UTF_8)) {
                w.write(text);
            } catch (IOException e) {
                exportPending.set(false);
                reportBackup(false, "Couldn't prepare the backup");
                return;
            }
            final String name = safeFileName(fileName);
            // Anonymous classes, not lambdas: the Gradle free build has no desugaring library for d8.
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json").putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(create, EXPORT_REQ);
                    } catch (ActivityNotFoundException e) {
                        exportPending.set(false);
                        reportBackup(false, "This phone has no app to save files");
                    }
                }
            });
        }

        /** The page asks once it listens, and again on each workoutplan:backup event. Empty when there is nothing new. */
        @JavascriptInterface
        public String takeBackupResult() {
            String r = backupResult.getAndSet(null);
            return r == null ? "" : r;
        }
    }

    static String safeFileName(String name) {
        String clean = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "");
        if (clean.length() > 80) clean = clean.substring(0, 80);
        if (clean.isEmpty()) clean = "workout-log";
        return clean.endsWith(".json") ? clean : clean + ".json";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == IMPORT_REQ) {
            if (pendingImport == null) return; // the page reloaded meanwhile; tapping Import again works
            pendingImport.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); // null on cancel
            pendingImport = null;
        } else if (requestCode == EXPORT_REQ) {
            exportPending.set(false);
            File stash = new File(getCacheDir(), EXPORT_CACHE);
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                reportBackup(false, "Backup not saved");
            } else {
                boolean ok = stash.exists() && copyTo(stash, data.getData());
                reportBackup(ok, ok ? "Backup saved" : "Couldn't save the backup");
            }
            stash.delete();
        }
    }

    // "wt" truncates an existing file; some document providers refuse it, so plain "w" is the fallback.
    private boolean copyTo(File source, Uri target) {
        for (String mode : new String[] {"wt", "w"}) {
            try (InputStream in = new FileInputStream(source); OutputStream out = getContentResolver().openOutputStream(target, mode)) {
                if (out == null) return false;
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return true;
            } catch (IllegalArgumentException | UnsupportedOperationException | FileNotFoundException e) {
                // try the next mode
            } catch (IOException e) {
                return false;
            }
        }
        return false;
    }

    /**
     * Toast for the user, and the result for the page, so it only records a backup that was really written.
     * The result waits in backupResult until the page takes it: after Android restarts the app during the picker,
     * this runs before the page has loaded, so the event alone would be lost. "at" is when the file was written.
     */
    private void reportBackup(final boolean ok, final String message) {
        backupResult.set("{\"ok\":" + ok + ",\"at\":" + System.currentTimeMillis() + "}");
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                web.evaluateJavascript("window.dispatchEvent(new Event('workoutplan:backup'))", null);
            }
        });
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
