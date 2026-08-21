package com.highway38.resellerscout;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;

/**
 * v0.1.35 no longer stacks JavaScript patch layers over the owner UI.
 * The production product flow lives in the embedded Scout application itself.
 * This provider remains only to preserve the installed manifest contract.
 */
public final class ResellerScoutPatchProvider extends ContentProvider {
    public static final String PRODUCT_FLOW_MARKER = "H38_SCOUT_PRODUCT_FLOW_V035";
    public static final String LEGACY_PATCH_STACK_REMOVED = "H38_LEGACY_PATCH_STACK_REMOVED_V035";

    @Override public boolean onCreate() { return true; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) { return null; }
    @Override public String getType(Uri uri) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
