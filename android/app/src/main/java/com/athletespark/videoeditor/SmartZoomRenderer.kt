package com.athletespark.videoeditor

import android.opengl.GLES20
import android.opengl.GLES11Ext
import android.opengl.Matrix

class SmartZoomRenderer(
    private val videoWidth: Int,
    private val videoHeight: Int,
    private val outputWidth: Int,
    private val outputHeight: Int
) {
    private var program = 0
    private var positionHandle = 0
    private var texCoordHandle = 0
    private var centerHandle = 0
    private var zoomHandle = 0

    private val vertexShaderCode = """
        attribute vec4 aPosition;
        attribute vec2 aTexCoord;
        varying vec2 vTexCoord;
        void main() {
            gl_Position = aPosition;
            vTexCoord = aTexCoord;
        }
    """

    private val fragmentShaderCode = """
        #extension GL_OES_EGL_image_external : require
        precision mediump float;
        uniform samplerExternalOES uTexture;
        uniform vec2 uCenter;
        uniform float uZoom;
        varying vec2 vTexCoord;
        void main() {
            vec2 zoomedCoord = (vTexCoord - uCenter) * uZoom + 0.5;
            gl_FragColor = texture2D(uTexture, zoomedCoord);
        }
    """

    fun initGL() {
        program = createProgram(vertexShaderCode, fragmentShaderCode)
        positionHandle = GLES20.glGetAttribLocation(program, "aPosition")
        texCoordHandle = GLES20.glGetAttribLocation(program, "aTexCoord")
        centerHandle = GLES20.glGetUniformLocation(program, "uCenter")
        zoomHandle = GLES20.glGetUniformLocation(program, "uZoom")
    }

    fun renderFrame(textureId: Int, centerX: Float, centerY: Float, zoom: Float) {
        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)

        GLES20.glUniform2f(centerHandle, centerX, centerY)
        GLES20.glUniform1f(zoomHandle, zoom)

        // Setup quad here (coordinates omitted for brevity)
        // Draw call: GLES20.glDrawArrays(...)

        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, 0)
        GLES20.glUseProgram(0)
    }

    private fun loadShader(type: Int, code: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, code)
        GLES20.glCompileShader(shader)
        return shader
    }

    private fun createProgram(vertexCode: String, fragmentCode: String): Int {
        val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexCode)
        val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentCode)
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertexShader)
        GLES20.glAttachShader(program, fragmentShader)
        GLES20.glLinkProgram(program)
        return program
    }
}
