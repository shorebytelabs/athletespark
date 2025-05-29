package com.athletespark.videoeditor

import android.graphics.SurfaceTexture
import android.opengl.*
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

class CodecOutputSurface(
    private val videoWidth: Int,
    private val videoHeight: Int,
    private val outputWidth: Int,
    private val outputHeight: Int
) {
    private val vertexCoords = floatArrayOf(
        -1.0f, -1.0f,
         1.0f, -1.0f,
        -1.0f,  1.0f,
         1.0f,  1.0f
    )
    private val texCoords = floatArrayOf(
        0.0f, 1.0f,
        1.0f, 1.0f,
        0.0f, 0.0f,
        1.0f, 0.0f
    )

    private val vertexBuffer: FloatBuffer = ByteBuffer
        .allocateDirect(vertexCoords.size * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
        .apply {
            put(vertexCoords)
            position(0)
        }

    private val texBuffer: FloatBuffer = ByteBuffer
        .allocateDirect(texCoords.size * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
        .apply {
            put(texCoords)
            position(0)
        }

    private var _textureId = -1
    private lateinit var surfaceTexture: SurfaceTexture
    lateinit var surface: Surface
        private set

    private var frameAvailable = false
    private val frameSyncObject = Object()

    private lateinit var eglDisplay: EGLDisplay
    private lateinit var eglContext: EGLContext
    private lateinit var eglSurface: EGLSurface

    fun awaitNewImage() {
        synchronized(frameSyncObject) {
            while (!frameAvailable) {
                try {
                    frameSyncObject.wait(500)
                    if (!frameAvailable) {
                        throw RuntimeException("Frame wait timed out")
                    }
                } catch (ie: InterruptedException) {
                    throw RuntimeException(ie)
                }
            }
            frameAvailable = false
        }

        surfaceTexture.updateTexImage()
    }

    fun drawImage(drawFn: () -> Unit) {
        drawFn()
    }

    fun setPresentationTime(nanoseconds: Long) {
        EGLExt.eglPresentationTimeANDROID(eglDisplay, eglSurface, nanoseconds)
    }

    fun swapBuffers(): Boolean {
        return EGL14.eglSwapBuffers(eglDisplay, eglSurface)
    }

    fun release() {
        EGL14.eglDestroySurface(eglDisplay, eglSurface)
        EGL14.eglDestroyContext(eglDisplay, eglContext)
        EGL14.eglReleaseThread()
        EGL14.eglTerminate(eglDisplay)
        surface.release()
        surfaceTexture.release()
    }

    init {
        setupEGL()
        setupSurfaceTexture()
    }

    private fun setupEGL() {
        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        if (eglDisplay == EGL14.EGL_NO_DISPLAY) throw RuntimeException("Unable to get EGL14 display")

        val version = IntArray(2)
        if (!EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) {
            throw RuntimeException("Unable to initialize EGL14")
        }

        val attribList = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL14.EGL_NONE
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        val numConfigs = IntArray(1)
        EGL14.eglChooseConfig(eglDisplay, attribList, 0, configs, 0, configs.size, numConfigs, 0)

        val contextAttribs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
        eglContext = EGL14.eglCreateContext(eglDisplay, configs[0], EGL14.EGL_NO_CONTEXT, contextAttribs, 0)
        checkEglError("eglCreateContext")

        val surfaceAttribs = intArrayOf(EGL14.EGL_WIDTH, outputWidth, EGL14.EGL_HEIGHT, outputHeight, EGL14.EGL_NONE)
        eglSurface = EGL14.eglCreatePbufferSurface(eglDisplay, configs[0], surfaceAttribs, 0)
        checkEglError("eglCreatePbufferSurface")

        if (!EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)) {
            throw RuntimeException("eglMakeCurrent failed")
        }
    }

    private fun setupSurfaceTexture() {
        val textures = IntArray(1)
        GLES20.glGenTextures(1, textures, 0)
        _textureId = textures[0]

        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, _textureId)
        GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST.toFloat())
        GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR.toFloat())
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

        surfaceTexture = SurfaceTexture(_textureId)
        surface = Surface(surfaceTexture)

        surfaceTexture.setOnFrameAvailableListener {
            synchronized(frameSyncObject) {
                if (frameAvailable) throw RuntimeException("Frame already available!")
                frameAvailable = true
                frameSyncObject.notifyAll()
            }
        }
    }

    private fun checkEglError(msg: String) {
        val error = EGL14.eglGetError()
        if (error != EGL14.EGL_SUCCESS) {
            throw RuntimeException("$msg: EGL error: 0x${Integer.toHexString(error)}")
        }
    }

    val textureId: Int
        get() = _textureId
}
