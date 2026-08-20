package com.highway38.resellerscout;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Visible one-time retailer session/setup browser for store-bound checks. */
public final class RetailerVerificationActivity extends Activity {
    public static final String EXTRA_RETAILER = "retailer";
    public static final String EXTRA_QUERY = "query";
    public static final String EXTRA_SOURCE_URL = "source_url";
    public static final String EXTRA_STORE = "store";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        String retailer = value(EXTRA_RETAILER), query = value(EXTRA_QUERY), source = value(EXTRA_SOURCE_URL), store = value(EXTRA_STORE);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.WHITE);
        TextView note = new TextView(this); note.setPadding(18, 14, 18, 14); note.setTextSize(13f);
        note.setText("Target: " + (store.isBlank() ? "selected Scout store" : store) + "\nConfirm/select this physical store on " + retailer + " once. The retailer session stays on this phone. Then tap Back to Scout and recheck. Scout only reports price/quantity when this page exposes them for the selected store.");
        root.addView(note);
        Button back = new Button(this); back.setText("Back to Scout"); back.setOnClickListener(v -> finish()); root.addView(back);
        WebView w = new WebView(this); WebSettings s = w.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setUserAgentString(s.getUserAgentString()+" H38ResellerScoutRetailer/0.1.27");
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(w,true);
        w.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req){Uri u=req.getUrl();if(u==null)return false;String h=String.valueOf(u.getHost()).toLowerCase();if((retailer.equals("Home Depot")&&h.endsWith("homedepot.com"))||(retailer.equals("Dollar General")&&h.endsWith("dollargeneral.com")))return false;return true;}});
        root.addView(w,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,0,1f)); setContentView(root);
        w.loadUrl(startUrl(retailer,query,source));
    }
    private String value(String k){String v=getIntent().getStringExtra(k);return v==null?"":v.trim();}
    private static String startUrl(String retailer,String query,String source){
        try{if(!source.isBlank()){Uri u=Uri.parse(source);String h=String.valueOf(u.getHost()).toLowerCase();if(retailer.equals("Home Depot")&&h.endsWith("homedepot.com"))return source;if(retailer.equals("Dollar General")&&h.endsWith("dollargeneral.com"))return source;}}catch(Exception ignored){}
        String q=Uri.encode(query.isBlank()?"tools":query);
        return retailer.equals("Dollar General")?"https://www.dollargeneral.com/product-search.html?query="+q:"https://www.homedepot.com/s/"+q;
    }
}
