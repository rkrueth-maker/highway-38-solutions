package com.highway38.sitescanner;

import android.opengl.GLES11Ext;
import android.opengl.GLES20;

import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

final class CameraBackgroundRenderer {
    private static final float[] QUAD = {-1,-1, 1,-1, -1,1, 1,1};
    private static final float[] UV = {0,1, 1,1, 0,0, 1,0};
    private final FloatBuffer vertices = buffer(QUAD);
    private final FloatBuffer inputUv = buffer(UV);
    private final FloatBuffer transformedUv = buffer(UV);
    private int textureId = -1;
    private int program;
    private int position;
    private int texCoord;
    private int texture;

    int createOnGlThread() {
        int[] ids = new int[1];
        GLES20.glGenTextures(1, ids, 0);
        textureId = ids[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);

        String vs = "attribute vec4 a_Position;\nattribute vec2 a_TexCoord;\nvarying vec2 v_TexCoord;\nvoid main(){gl_Position=a_Position;v_TexCoord=a_TexCoord;}";
        String fs = "#extension GL_OES_EGL_image_external : require\nprecision mediump float;\nuniform samplerExternalOES u_Texture;\nvarying vec2 v_TexCoord;\nvoid main(){gl_FragColor=texture2D(u_Texture,v_TexCoord);}";
        int v = compile(GLES20.GL_VERTEX_SHADER, vs);
        int f = compile(GLES20.GL_FRAGMENT_SHADER, fs);
        program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, v);
        GLES20.glAttachShader(program, f);
        GLES20.glLinkProgram(program);
        int[] linked = new int[1];
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0);
        if (linked[0] == 0) throw new IllegalStateException(GLES20.glGetProgramInfoLog(program));
        GLES20.glDeleteShader(v);
        GLES20.glDeleteShader(f);
        position = GLES20.glGetAttribLocation(program, "a_Position");
        texCoord = GLES20.glGetAttribLocation(program, "a_TexCoord");
        texture = GLES20.glGetUniformLocation(program, "u_Texture");
        return textureId;
    }

    void draw(Frame frame) {
        if (frame.hasDisplayGeometryChanged()) {
            vertices.position(0);
            transformedUv.position(0);
            frame.transformCoordinates2d(
                    Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
                    vertices,
                    Coordinates2d.TEXTURE_NORMALIZED,
                    transformedUv
            );
        }
        if (frame.getTimestamp() == 0) return;
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);
        GLES20.glUseProgram(program);
        vertices.position(0);
        GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 0, vertices);
        GLES20.glEnableVertexAttribArray(position);
        transformedUv.position(0);
        GLES20.glVertexAttribPointer(texCoord, 2, GLES20.GL_FLOAT, false, 0, transformedUv);
        GLES20.glEnableVertexAttribArray(texCoord);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glUniform1i(texture, 0);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(position);
        GLES20.glDisableVertexAttribArray(texCoord);
        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
    }

    private static int compile(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        int[] ok = new int[1];
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) throw new IllegalStateException(GLES20.glGetShaderInfoLog(shader));
        return shader;
    }

    private static FloatBuffer buffer(float[] values) {
        FloatBuffer out = ByteBuffer.allocateDirect(values.length * 4)
                .order(ByteOrder.nativeOrder()).asFloatBuffer();
        out.put(values).position(0);
        return out;
    }
}
