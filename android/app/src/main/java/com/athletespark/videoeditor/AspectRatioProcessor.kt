package com.athletespark.videoeditor

import android.content.ContentValues
import android.content.Context
import android.graphics.Matrix
import android.media.*
import android.net.Uri
import android.opengl.GLES20
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.view.Surface
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import kotlin.concurrent.thread

/**
 * Processes video clips with aspect ratio transformation using MediaCodec and OpenGL.
 * Designed to be extensible for future effects like smart zoom, spotlight, and overlays.
 */
class AspectRatioProcessor(private val context: Context) {

    companion object {
        private const val TAG = "AspectRatioProcessor"
        private const val TIMEOUT_US = 10000L
        private const val VIDEO_MIME_TYPE = "video/avc"
        private const val AUDIO_MIME_TYPE = "audio/mp4a-latm"
    }

    data class ProcessingClip(
        val path: String,
        val trimStartUs: Long,
        val trimEndUs: Long
    )

    fun processWithAspectRatio(
        clips: List<ProcessingClip>,
        outputPath: String,
        outputWidth: Int,
        outputHeight: Int,
        onComplete: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        thread {
            var encoder: MediaCodec? = null
            var decoder: MediaCodec? = null
            var muxer: MediaMuxer? = null
            var inputSurface: InputSurface? = null
            var outputSurface: OutputSurface? = null
            
            try {
                Log.d(TAG, "=== ASPECT RATIO PROCESSING START ===")
                Log.d(TAG, "Output dimensions: ${outputWidth}x${outputHeight}")
                Log.d(TAG, "Clips count: ${clips.size}")
                
                // Create temporary file for processing
                val tempFile = File(context.cacheDir, "temp_aspect_ratio_${System.currentTimeMillis()}.mp4")
                muxer = MediaMuxer(tempFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
                
                var videoTrackIndex = -1
                var audioTrackIndex = -1
                var muxerStarted = false
                var presentationTimeUsOffset = 0L
                
                for ((clipIndex, clip) in clips.withIndex()) {
                    Log.d(TAG, "=== PROCESSING CLIP $clipIndex ===")
                    Log.d(TAG, "Clip path: ${clip.path}")
                    
                    val inputUri = Uri.fromFile(File(clip.path))
                    val extractor = MediaExtractor()
                    
                    try {
                        extractor.setDataSource(context, inputUri, null)
                        
                        // Find video and audio tracks
                        var videoTrack = -1
                        var audioTrack = -1
                        var videoFormat: MediaFormat? = null
                        var audioFormat: MediaFormat? = null
                        
                        for (i in 0 until extractor.trackCount) {
                            val format = extractor.getTrackFormat(i)
                            val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                            
                            when {
                                mime.startsWith("video/") && videoTrack == -1 -> {
                                    videoTrack = i
                                    videoFormat = format
                                    Log.d(TAG, "Found video track: $i, format: $format")
                                }
                                mime.startsWith("audio/") && audioTrack == -1 -> {
                                    audioTrack = i
                                    audioFormat = format
                                    Log.d(TAG, "Found audio track: $i, format: $format")
                                }
                            }
                        }
                        
                        // Setup encoder and muxer on first clip
                        if (!muxerStarted && videoFormat != null) {
                            val inputWidth = videoFormat.getInteger(MediaFormat.KEY_WIDTH)
                            val inputHeight = videoFormat.getInteger(MediaFormat.KEY_HEIGHT)
                            
                            Log.d(TAG, "Input video dimensions: ${inputWidth}x${inputHeight}")
                            Log.d(TAG, "Output video dimensions: ${outputWidth}x${outputHeight}")
                            
                            // Create encoder
                            val encoderFormat = MediaFormat.createVideoFormat(VIDEO_MIME_TYPE, outputWidth, outputHeight).apply {
                                setInteger(MediaFormat.KEY_BIT_RATE, 5_000_000)
                                setInteger(MediaFormat.KEY_FRAME_RATE, 30)
                                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
                                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                            }
                            
                            encoder = MediaCodec.createEncoderByType(VIDEO_MIME_TYPE)
                            encoder.configure(encoderFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                            
                            // Create input surface for encoder
                            val encoderSurface = encoder.createInputSurface()
                            inputSurface = InputSurface(encoderSurface)
                            inputSurface.makeCurrent()
                            
                            encoder.start()
                            
                            // Create decoder
                            val mime = videoFormat.getString(MediaFormat.KEY_MIME)!!
                            decoder = MediaCodec.createDecoderByType(mime)
                            
                            // Create output surface for decoder
                            outputSurface = OutputSurface(inputWidth, inputHeight, outputWidth, outputHeight)
                            decoder.configure(videoFormat, outputSurface.surface, null, 0)
                            decoder.start()
                            
                            // Add video track to muxer
                            videoTrackIndex = muxer.addTrack(encoderFormat)
                            Log.d(TAG, "Added video track to muxer: $videoTrackIndex")
                            
                            // Add audio track to muxer if available
                            if (audioFormat != null) {
                                audioTrackIndex = muxer.addTrack(audioFormat)
                                Log.d(TAG, "Added audio track to muxer: $audioTrackIndex")
                            }
                            
                            muxer.start()
                            muxerStarted = true
                            Log.d(TAG, "Muxer started successfully")
                        }
                        
                        // Process video with aspect ratio transformation
                        if (videoTrack != -1 && decoder != null && encoder != null && outputSurface != null) {
                            val isLastClip = (clipIndex == clips.size - 1)
                            presentationTimeUsOffset = processVideoTrack(
                                extractor = extractor,
                                videoTrack = videoTrack,
                                decoder = decoder,
                                encoder = encoder,
                                muxer = muxer,
                                videoTrackIndex = videoTrackIndex,
                                outputSurface = outputSurface,
                                inputSurface = inputSurface!!,
                                trimStartUs = clip.trimStartUs,
                                trimEndUs = clip.trimEndUs,
                                presentationTimeOffset = presentationTimeUsOffset,
                                isLastClip = isLastClip
                            )
                            
                            Log.d(TAG, "Clip $clipIndex video processing complete, next offset: $presentationTimeUsOffset")
                        }
                        
                        // Process audio (direct copy, no transformation)
                        if (audioTrack != -1) {
                            processAudioTrack(
                                extractor = extractor,
                                audioTrack = audioTrack,
                                muxer = muxer,
                                audioTrackIndex = audioTrackIndex,
                                trimStartUs = clip.trimStartUs,
                                trimEndUs = clip.trimEndUs,
                                presentationTimeOffset = presentationTimeUsOffset - (clip.trimEndUs - clip.trimStartUs)
                            )
                        }
                        
                    } finally {
                        extractor.release()
                    }
                }
                
                // Clean up
                decoder?.stop()
                decoder?.release()
                encoder?.stop()
                encoder?.release()
                outputSurface?.release()
                inputSurface?.release()
                
                muxer?.stop()
                muxer?.release()
                
                Log.d(TAG, "=== PROCESSING COMPLETE ===")
                Log.d(TAG, "Temp file: ${tempFile.absolutePath}")
                Log.d(TAG, "Temp file size: ${tempFile.length()} bytes")
                
                // Copy to final destination
                val finalFile = File(outputPath)
                tempFile.copyTo(finalFile, overwrite = true)
                tempFile.delete()
                
                Log.d(TAG, "Video processing complete: ${finalFile.absolutePath}")
                
                // Don't save to gallery here - let the caller handle it
                // This allows for multiple clips to be processed and merged first
                onComplete(outputPath)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error processing video with aspect ratio: ${e.message}", e)
                
                // Clean up on error
                try {
                    decoder?.stop()
                    decoder?.release()
                    encoder?.stop()
                    encoder?.release()
                    outputSurface?.release()
                    inputSurface?.release()
                    muxer?.stop()
                    muxer?.release()
                } catch (cleanupError: Exception) {
                    Log.e(TAG, "Error during cleanup: ${cleanupError.message}")
                }
                
                onError("Failed to process video: ${e.message}")
            }
        }
    }
    
    private fun processVideoTrack(
        extractor: MediaExtractor,
        videoTrack: Int,
        decoder: MediaCodec,
        encoder: MediaCodec,
        muxer: MediaMuxer,
        videoTrackIndex: Int,
        outputSurface: OutputSurface,
        inputSurface: InputSurface,
        trimStartUs: Long,
        trimEndUs: Long,
        presentationTimeOffset: Long,
        isLastClip: Boolean
    ): Long {
        Log.d(TAG, "=== PROCESSING VIDEO TRACK ===")
        Log.d(TAG, "Trim: ${trimStartUs}us to ${trimEndUs}us")
        Log.d(TAG, "Offset: ${presentationTimeOffset}us")
        
        extractor.selectTrack(videoTrack)
        extractor.seekTo(trimStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        
        Log.d(TAG, "Decoder and encoder configured and started")
        Log.d(TAG, "Extractor selected track $videoTrack and seeked to $trimStartUs")
        
        val bufferInfo = MediaCodec.BufferInfo()
        var sawInputEOS = false
        var sawOutputEOS = false
        var lastWrittenPts = presentationTimeOffset
        
        var loopCount = 0
        val maxLoops = 10000 // Safety limit to prevent infinite loops
        var framesProcessed = 0
        
        while (!sawOutputEOS && loopCount < maxLoops) {
            loopCount++
            
            if (loopCount % 100 == 0) {
                Log.d(TAG, "Processing loop iteration $loopCount, frames processed: $framesProcessed, sawInputEOS: $sawInputEOS, sawOutputEOS: $sawOutputEOS")
            }
            
            // Feed decoder
            if (!sawInputEOS) {
                val inputBufferIndex = decoder.dequeueInputBuffer(TIMEOUT_US)
                if (inputBufferIndex >= 0) {
                    val buffer = decoder.getInputBuffer(inputBufferIndex)!!
                    val sampleSize = extractor.readSampleData(buffer, 0)
                    
                    if (sampleSize < 0 || extractor.sampleTime == -1L || extractor.sampleTime > trimEndUs) {
                        decoder.queueInputBuffer(inputBufferIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        sawInputEOS = true
                        Log.d(TAG, "Decoder input EOS signaled")
                    } else {
                        val sampleTime = extractor.sampleTime
                        if (sampleTime >= trimStartUs) {
                            decoder.queueInputBuffer(inputBufferIndex, 0, sampleSize, sampleTime, 0)
                        }
                        extractor.advance()
                    }
                } else if (inputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                    // No input buffer available, continue to drain output
                }
            }
            
            // Get decoded frame
            val outputBufferIndex = decoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            if (outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                // No output available yet
                if (sawInputEOS) {
                    // If we've sent EOS and no more output, we're done
                    Log.d(TAG, "No more decoder output after EOS")
                    sawOutputEOS = true
                }
            } else if (outputBufferIndex >= 0) {
                val doRender = bufferInfo.size > 0 && bufferInfo.presentationTimeUs >= trimStartUs
                
                if (doRender) {
                    // Render to surface with aspect ratio transformation
                    decoder.releaseOutputBuffer(outputBufferIndex, true)
                    outputSurface.awaitNewImage()
                    outputSurface.drawImage()
                    
                    // Calculate adjusted presentation time
                    val adjustedPts = (bufferInfo.presentationTimeUs - trimStartUs) + presentationTimeOffset
                    
                    // Feed encoder
                    inputSurface.setPresentationTime(adjustedPts * 1000) // Convert to nanoseconds
                    inputSurface.swapBuffers()
                    
                    // Drain encoder output
                    drainEncoder(encoder, muxer, videoTrackIndex, bufferInfo, endOfStream = false)
                    
                    lastWrittenPts = adjustedPts
                    framesProcessed++
                } else {
                    decoder.releaseOutputBuffer(outputBufferIndex, false)
                }
                
                if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    sawOutputEOS = true
                }
            }
        }
        
        if (loopCount >= maxLoops) {
            Log.e(TAG, "Video processing loop exceeded maximum iterations ($maxLoops)")
            Log.e(TAG, "Frames processed: $framesProcessed, sawInputEOS: $sawInputEOS, sawOutputEOS: $sawOutputEOS")
            throw Exception("Video processing exceeded maximum iterations")
        }
        
        Log.d(TAG, "Decoder loop completed after $loopCount iterations, $framesProcessed frames processed")
        
        // Only signal end of stream on the last clip
        if (isLastClip) {
            Log.d(TAG, "Last clip - signaling end of input stream to encoder")
            encoder.signalEndOfInputStream()
            drainEncoder(encoder, muxer, videoTrackIndex, bufferInfo, endOfStream = true)
        } else {
            Log.d(TAG, "Not last clip - continuing without signaling EOS")
            // Flush decoder to prepare for next clip
            try {
                decoder.flush()
                Log.d(TAG, "Decoder flushed for next clip")
            } catch (e: Exception) {
                Log.w(TAG, "Error flushing decoder: ${e.message}")
            }
        }
        
        extractor.unselectTrack(videoTrack)
        
        Log.d(TAG, "Video track processing complete, last PTS: $lastWrittenPts")
        
        // Calculate next offset based on clip duration
        val clipDuration = trimEndUs - trimStartUs
        return presentationTimeOffset + clipDuration
    }
    
    private fun drainEncoder(
        encoder: MediaCodec,
        muxer: MediaMuxer,
        trackIndex: Int,
        bufferInfo: MediaCodec.BufferInfo,
        endOfStream: Boolean = false
    ) {
        Log.d(TAG, "=== DRAINING ENCODER (EOS: $endOfStream) ===")
        
        while (true) {
            val outputBufferIndex = encoder.dequeueOutputBuffer(bufferInfo, if (endOfStream) TIMEOUT_US else 0)
            
            if (outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!endOfStream) {
                    break // No output available yet
                }
                // If we're at end of stream, keep trying
            } else if (outputBufferIndex >= 0) {
                val encodedData = encoder.getOutputBuffer(outputBufferIndex)!!
                
                if (bufferInfo.size > 0) {
                    encodedData.position(bufferInfo.offset)
                    encodedData.limit(bufferInfo.offset + bufferInfo.size)
                    muxer.writeSampleData(trackIndex, encodedData, bufferInfo)
                    Log.d(TAG, "Wrote encoded frame: PTS=${bufferInfo.presentationTimeUs}, size=${bufferInfo.size}")
                }
                
                encoder.releaseOutputBuffer(outputBufferIndex, false)
                
                if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    Log.d(TAG, "Encoder end of stream reached")
                    break
                }
            }
        }
    }
    
    private fun processAudioTrack(
        extractor: MediaExtractor,
        audioTrack: Int,
        muxer: MediaMuxer,
        audioTrackIndex: Int,
        trimStartUs: Long,
        trimEndUs: Long,
        presentationTimeOffset: Long
    ) {
        Log.d(TAG, "=== PROCESSING AUDIO TRACK ===")
        
        extractor.selectTrack(audioTrack)
        extractor.seekTo(trimStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        
        val bufferInfo = MediaCodec.BufferInfo()
        val buffer = ByteBuffer.allocate(1024 * 1024)
        
        while (true) {
            val sampleTime = extractor.sampleTime
            if (sampleTime == -1L || sampleTime > trimEndUs) break
            
            if (sampleTime >= trimStartUs) {
                bufferInfo.offset = 0
                bufferInfo.size = extractor.readSampleData(buffer, 0)
                if (bufferInfo.size < 0) break
                
                bufferInfo.presentationTimeUs = (sampleTime - trimStartUs) + presentationTimeOffset
                bufferInfo.flags = extractor.sampleFlags
                
                muxer.writeSampleData(audioTrackIndex, buffer, bufferInfo)
            }
            
            extractor.advance()
        }
        
        extractor.unselectTrack(audioTrack)
        Log.d(TAG, "Audio track processing complete")
    }
    
    /**
     * OpenGL surface for encoder input
     */
    private class InputSurface(private val surface: Surface) {
        private var eglDisplay: android.opengl.EGLDisplay? = null
        private var eglContext: android.opengl.EGLContext? = null
        private var eglSurface: android.opengl.EGLSurface? = null
        
        init {
            eglSetup()
        }
        
        private fun eglSetup() {
            eglDisplay = android.opengl.EGL14.eglGetDisplay(android.opengl.EGL14.EGL_DEFAULT_DISPLAY)
            if (eglDisplay == android.opengl.EGL14.EGL_NO_DISPLAY) {
                throw RuntimeException("Unable to get EGL14 display")
            }
            
            val version = IntArray(2)
            if (!android.opengl.EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) {
                eglDisplay = null
                throw RuntimeException("Unable to initialize EGL14")
            }
            
            val attribList = intArrayOf(
                android.opengl.EGL14.EGL_RED_SIZE, 8,
                android.opengl.EGL14.EGL_GREEN_SIZE, 8,
                android.opengl.EGL14.EGL_BLUE_SIZE, 8,
                android.opengl.EGL14.EGL_RENDERABLE_TYPE, android.opengl.EGL14.EGL_OPENGL_ES2_BIT,
                android.opengl.EGL14.EGL_SURFACE_TYPE, android.opengl.EGL14.EGL_WINDOW_BIT,
                android.opengl.EGL14.EGL_NONE
            )
            
            val configs = arrayOfNulls<android.opengl.EGLConfig>(1)
            val numConfigs = IntArray(1)
            if (!android.opengl.EGL14.eglChooseConfig(eglDisplay, attribList, 0, configs, 0, configs.size, numConfigs, 0)) {
                throw RuntimeException("Unable to find RGB888+recordable ES2 EGL config")
            }
            
            val contextAttribList = intArrayOf(
                android.opengl.EGL14.EGL_CONTEXT_CLIENT_VERSION, 2,
                android.opengl.EGL14.EGL_NONE
            )
            
            eglContext = android.opengl.EGL14.eglCreateContext(
                eglDisplay, configs[0], android.opengl.EGL14.EGL_NO_CONTEXT, contextAttribList, 0
            )
            
            if (eglContext == null) {
                throw RuntimeException("Null EGL context")
            }
            
            val surfaceAttribs = intArrayOf(android.opengl.EGL14.EGL_NONE)
            eglSurface = android.opengl.EGL14.eglCreateWindowSurface(eglDisplay, configs[0], surface, surfaceAttribs, 0)
            
            if (eglSurface == null) {
                throw RuntimeException("Surface was null")
            }
        }
        
        fun makeCurrent() {
            if (!android.opengl.EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)) {
                throw RuntimeException("eglMakeCurrent failed")
            }
        }
        
        fun swapBuffers() {
            android.opengl.EGL14.eglSwapBuffers(eglDisplay, eglSurface)
        }
        
        fun setPresentationTime(nsecs: Long) {
            android.opengl.EGLExt.eglPresentationTimeANDROID(eglDisplay, eglSurface, nsecs)
        }
        
        fun release() {
            if (eglDisplay != android.opengl.EGL14.EGL_NO_DISPLAY) {
                android.opengl.EGL14.eglDestroySurface(eglDisplay, eglSurface)
                android.opengl.EGL14.eglDestroyContext(eglDisplay, eglContext)
                android.opengl.EGL14.eglReleaseThread()
                android.opengl.EGL14.eglTerminate(eglDisplay)
            }
            
            surface.release()
            
            eglDisplay = android.opengl.EGL14.EGL_NO_DISPLAY
            eglContext = android.opengl.EGL14.EGL_NO_CONTEXT
            eglSurface = android.opengl.EGL14.EGL_NO_SURFACE
        }
    }
    
    /**
     * OpenGL surface for decoder output with aspect ratio transformation
     */
    private class OutputSurface(
        private val inputWidth: Int,
        private val inputHeight: Int,
        private val outputWidth: Int,
        private val outputHeight: Int
    ) {
        private var surfaceTexture: android.graphics.SurfaceTexture? = null
        val surface: Surface
        
        private val textureRender = TextureRender()
        private var textureId = -1
        
        init {
            textureRender.surfaceCreated()
            textureId = textureRender.createTextureObject()
            surfaceTexture = android.graphics.SurfaceTexture(textureId)
            surface = Surface(surfaceTexture)
            
            // Calculate transformation matrix for aspect ratio
            calculateTransform()
        }
        
        private fun calculateTransform() {
            // Calculate scale factors to fill the output dimensions (center crop)
            val inputAspect = inputWidth.toFloat() / inputHeight.toFloat()
            val outputAspect = outputWidth.toFloat() / outputHeight.toFloat()
            
            // For texture coordinate scaling, we want to SHRINK the sampling area
            // to achieve a center-crop effect that fills the output frame
            val scaleX: Float
            val scaleY: Float
            
            if (inputAspect > outputAspect) {
                // Input is wider than output (e.g., 16:9 → 9:16 or 1:1)
                // We need to sample from a narrower horizontal region (center crop horizontally)
                scaleX = outputAspect / inputAspect  // < 1.0, shrinks sampling area
                scaleY = 1.0f
            } else {
                // Input is taller than output (e.g., 9:16 → 16:9)
                // We need to sample from a shorter vertical region (center crop vertically)
                scaleX = 1.0f
                scaleY = inputAspect / outputAspect  // < 1.0, shrinks sampling area
            }
            
            Log.d(TAG, "Aspect ratio transform - Input: ${inputWidth}x${inputHeight} ($inputAspect), Output: ${outputWidth}x${outputHeight} ($outputAspect), Scale: ${scaleX}x${scaleY}")
            
            textureRender.setTransform(scaleX, scaleY)
        }
        
        fun awaitNewImage() {
            surfaceTexture?.updateTexImage()
        }
        
        fun drawImage() {
            textureRender.drawFrame(surfaceTexture!!)
        }
        
        fun release() {
            surface.release()
            surfaceTexture?.release()
        }
    }
    
    /**
     * OpenGL texture renderer with transformation support
     */
    private class TextureRender {
        private var program = 0
        private var textureTarget = 0
        private var positionHandle = 0
        private var textureHandle = 0
        private var mvpMatrixHandle = 0
        private var texMatrixHandle = 0
        
        private val mvpMatrix = FloatArray(16)
        private val transformMatrix = FloatArray(16)
        
        private val triangleVertices = floatArrayOf(
            -1.0f, -1.0f,   // 0 bottom left
            1.0f, -1.0f,    // 1 bottom right
            -1.0f,  1.0f,   // 2 top left
            1.0f,  1.0f     // 3 top right
        )
        
        private val textureVertices = floatArrayOf(
            0.0f, 0.0f,     // 0 bottom left
            1.0f, 0.0f,     // 1 bottom right
            0.0f, 1.0f,     // 2 top left
            1.0f, 1.0f      // 3 top right
        )
        
        fun surfaceCreated() {
            android.opengl.Matrix.setIdentityM(mvpMatrix, 0)
            android.opengl.Matrix.setIdentityM(transformMatrix, 0)
        }
        
        fun createTextureObject(): Int {
            val textures = IntArray(1)
            GLES20.glGenTextures(1, textures, 0)
            val textureId = textures[0]
            
            textureTarget = android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES
            GLES20.glBindTexture(textureTarget, textureId)
            GLES20.glTexParameteri(textureTarget, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(textureTarget, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(textureTarget, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(textureTarget, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            
            createProgram()
            
            return textureId
        }
        
        private fun createProgram() {
            val vertexShader = """
                attribute vec4 aPosition;
                attribute vec4 aTextureCoord;
                uniform mat4 uMVPMatrix;
                uniform mat4 uTexMatrix;
                varying vec2 vTextureCoord;
                void main() {
                    gl_Position = uMVPMatrix * aPosition;
                    vTextureCoord = (uTexMatrix * aTextureCoord).xy;
                }
            """.trimIndent()
            
            val fragmentShader = """
                #extension GL_OES_EGL_image_external : require
                precision mediump float;
                varying vec2 vTextureCoord;
                uniform samplerExternalOES sTexture;
                void main() {
                    gl_FragColor = texture2D(sTexture, vTextureCoord);
                }
            """.trimIndent()
            
            program = createProgram(vertexShader, fragmentShader)
            positionHandle = GLES20.glGetAttribLocation(program, "aPosition")
            textureHandle = GLES20.glGetAttribLocation(program, "aTextureCoord")
            mvpMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix")
            texMatrixHandle = GLES20.glGetUniformLocation(program, "uTexMatrix")
        }
        
        private fun createProgram(vertexSource: String, fragmentSource: String): Int {
            val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexSource)
            val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource)
            
            val program = GLES20.glCreateProgram()
            GLES20.glAttachShader(program, vertexShader)
            GLES20.glAttachShader(program, fragmentShader)
            GLES20.glLinkProgram(program)
            
            return program
        }
        
        private fun loadShader(shaderType: Int, source: String): Int {
            val shader = GLES20.glCreateShader(shaderType)
            GLES20.glShaderSource(shader, source)
            GLES20.glCompileShader(shader)
            return shader
        }
        
        fun setTransform(scaleX: Float, scaleY: Float) {
            android.opengl.Matrix.setIdentityM(transformMatrix, 0)
            android.opengl.Matrix.scaleM(transformMatrix, 0, scaleX, scaleY, 1.0f)
        }
        
        fun drawFrame(surfaceTexture: android.graphics.SurfaceTexture) {
            GLES20.glClearColor(0.0f, 0.0f, 0.0f, 1.0f)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            
            GLES20.glUseProgram(program)
            
            // Set vertices
            val vertexBuffer = ByteBuffer.allocateDirect(triangleVertices.size * 4)
                .order(java.nio.ByteOrder.nativeOrder())
                .asFloatBuffer()
            vertexBuffer.put(triangleVertices)
            vertexBuffer.position(0)
            
            GLES20.glEnableVertexAttribArray(positionHandle)
            GLES20.glVertexAttribPointer(positionHandle, 2, GLES20.GL_FLOAT, false, 0, vertexBuffer)
            
            // Set texture coordinates
            val textureBuffer = ByteBuffer.allocateDirect(textureVertices.size * 4)
                .order(java.nio.ByteOrder.nativeOrder())
                .asFloatBuffer()
            textureBuffer.put(textureVertices)
            textureBuffer.position(0)
            
            GLES20.glEnableVertexAttribArray(textureHandle)
            GLES20.glVertexAttribPointer(textureHandle, 2, GLES20.GL_FLOAT, false, 0, textureBuffer)
            
            // Set MVP matrix (identity for now - positions stay as-is)
            GLES20.glUniformMatrix4fv(mvpMatrixHandle, 1, false, mvpMatrix, 0)
            
            // Apply transformation matrix to texture coordinates
            val texMatrix = FloatArray(16)
            surfaceTexture.getTransformMatrix(texMatrix)
            
            val combinedMatrix = FloatArray(16)
            android.opengl.Matrix.multiplyMM(combinedMatrix, 0, transformMatrix, 0, texMatrix, 0)
            
            GLES20.glUniformMatrix4fv(texMatrixHandle, 1, false, combinedMatrix, 0)
            
            // Draw
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            
            GLES20.glDisableVertexAttribArray(positionHandle)
            GLES20.glDisableVertexAttribArray(textureHandle)
        }
    }
    
    /**
     * Save the processed video to the device gallery
     */
    private fun saveToGallery(context: Context, file: File): String {
        Log.d(TAG, "=== SAVE TO GALLERY START ===")
        Log.d(TAG, "File: ${file.absolutePath}")
        Log.d(TAG, "File exists: ${file.exists()}")
        Log.d(TAG, "File size: ${file.length()} bytes")
        
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, file.name)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/AthleteSpark")
            put(MediaStore.Video.Media.DATE_ADDED, System.currentTimeMillis() / 1000)
            put(MediaStore.Video.Media.DATE_MODIFIED, System.currentTimeMillis() / 1000)
            put(MediaStore.Video.Media.SIZE, file.length())
        }
        
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        
        if (uri != null) {
            resolver.openOutputStream(uri)?.use { outputStream ->
                FileInputStream(file).use { inputStream ->
                    inputStream.copyTo(outputStream)
                }
            }
            
            // Update the media store record
            resolver.update(uri, values, null, null)
            
            Log.d(TAG, "Video saved to gallery: $uri")
            return uri.toString()
        } else {
            throw Exception("Failed to create MediaStore entry")
        }
    }
}

