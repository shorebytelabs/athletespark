package com.athletespark.videoeditor

import android.content.Context
import android.media.*
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import java.io.File
import java.io.IOException
import kotlin.concurrent.thread
import com.athletespark.videoeditor.model.FrameCenter
import com.athletespark.videoeditor.SmartZoomRenderer
import com.athletespark.videoeditor.CodecOutputSurface
import com.facebook.react.bridge.ReadableMap

class PreviewExportProcessor(private val context: Context) {

    companion object {
        private const val TAG = "PreviewExportProcessor"
    }

    fun processPreviewExport(
        clips: List<PreviewClip>,
        outputPath: String,
        outputWidth: Int,
        outputHeight: Int,
        aspectRatio: ReadableMap?,
        onComplete: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        thread {
            try {
                val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
                
                var videoTrackIndex = -1
                var audioTrackIndex = -1
                var muxerStarted = false
                
                var videoPresentationTimeUsOffset = 0L
                var audioPresentationTimeUsOffset = 0L
                
                for ((clipIndex, clip) in clips.withIndex()) {
                    Log.d(TAG, "Processing clip $clipIndex: ${clip.path}")
                    
                    val inputUri = Uri.fromFile(File(clip.path))
                    val extractor = MediaExtractor()
                    extractor.setDataSource(context, inputUri, null)
                    
                    val trackCount = extractor.trackCount
                    var videoTrack = -1
                    var audioTrack = -1
                    
                    // Select tracks
                    for (i in 0 until trackCount) {
                        val format = extractor.getTrackFormat(i)
                        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                        if (mime.startsWith("video/") && videoTrack == -1) {
                            videoTrack = i
                        } else if (mime.startsWith("audio/") && audioTrack == -1) {
                            audioTrack = i
                        }
                    }
                    
                    // Add tracks once (from first clip)
                    if (!muxerStarted) {
                        if (videoTrack != -1) {
                            val videoFormat = extractor.getTrackFormat(videoTrack)
                            videoTrackIndex = muxer.addTrack(videoFormat)
                        }
                        if (audioTrack != -1) {
                            val audioFormat = extractor.getTrackFormat(audioTrack)
                            audioTrackIndex = muxer.addTrack(audioFormat)
                        }
                        muxer.start()
                        muxerStarted = true
                    }
                    
                    // Process video with effects
                    if (videoTrack != -1) {
                        videoPresentationTimeUsOffset = processVideoWithEffects(
                            extractor = extractor,
                            videoTrack = videoTrack,
                            muxer = muxer,
                            muxerTrackIndex = videoTrackIndex,
                            clip = clip,
                            outputWidth = outputWidth,
                            outputHeight = outputHeight,
                            aspectRatio = aspectRatio,
                            presentationTimeOffset = videoPresentationTimeUsOffset
                        )
                    }
                    
                    // Process audio
                    if (audioTrack != -1) {
                        audioPresentationTimeUsOffset = processAudio(
                            extractor = extractor,
                            audioTrack = audioTrack,
                            muxer = muxer,
                            muxerTrackIndex = audioTrackIndex,
                            clip = clip,
                            presentationTimeOffset = audioPresentationTimeUsOffset
                        )
                    }
                    
                    extractor.release()
                }
                
                muxer.stop()
                muxer.release()
                
                // Save to gallery
                val savedPath = saveVideoToGallery(context, File(outputPath))
                onComplete(savedPath)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to process preview export: ${e.message}", e)
                onError("Failed to process preview export: ${e.message}")
            }
        }
    }
    
    private fun processVideoWithEffects(
        extractor: MediaExtractor,
        videoTrack: Int,
        muxer: MediaMuxer,
        muxerTrackIndex: Int,
        clip: PreviewClip,
        outputWidth: Int,
        outputHeight: Int,
        aspectRatio: ReadableMap?,
        presentationTimeOffset: Long
    ): Long {
        // This is where we would implement the video processing with all effects
        // Similar to SmartZoomProcessor but with additional effects
        
        val inputFormat = extractor.getTrackFormat(videoTrack)
        val mime = inputFormat.getString(MediaFormat.KEY_MIME)!!
        val videoWidth = inputFormat.getInteger(MediaFormat.KEY_WIDTH)
        val videoHeight = inputFormat.getInteger(MediaFormat.KEY_HEIGHT)
        
        // Create decoder and encoder
        val decoder = MediaCodec.createDecoderByType(mime)
        val encoderFormat = MediaFormat.createVideoFormat(mime, outputWidth, outputHeight).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, 5_000_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 30)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        }
        
        val encoder = MediaCodec.createEncoderByType(mime)
        encoder.configure(encoderFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val inputSurface = encoder.createInputSurface()
        encoder.start()
        
        val outputSurface = CodecOutputSurface(videoWidth, videoHeight, outputWidth, outputHeight)
        decoder.configure(inputFormat, outputSurface.surface, null, 0)
        decoder.start()
        
        // Create enhanced renderer that handles all effects
        val renderer = PreviewRenderer(
            videoWidth, videoHeight, outputWidth, outputHeight,
            clip.smartZoomKeyframes,
            clip.markerKeyframes,
            clip.spotlightMode,
            clip.spotlightData,
            aspectRatio
        )
        
        val bufferInfo = MediaCodec.BufferInfo()
        var sawInputEOS = false
        var sawOutputEOS = false
        var lastWrittenPts = presentationTimeOffset
        
        extractor.selectTrack(videoTrack)
        extractor.seekTo(clip.trimStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        
        while (!sawOutputEOS) {
            if (!sawInputEOS) {
                val inputBufferIndex = decoder.dequeueInputBuffer(10000)
                if (inputBufferIndex >= 0) {
                    val buffer = decoder.getInputBuffer(inputBufferIndex)!!
                    val sampleSize = extractor.readSampleData(buffer, 0)
                    if (sampleSize < 0) {
                        decoder.queueInputBuffer(
                            inputBufferIndex,
                            0,
                            0,
                            0,
                            MediaCodec.BUFFER_FLAG_END_OF_STREAM
                        )
                        sawInputEOS = true
                    } else {
                        val sampleTime = extractor.sampleTime
                        if (sampleTime > clip.trimEndUs) {
                            decoder.queueInputBuffer(
                                inputBufferIndex,
                                0,
                                0,
                                0,
                                MediaCodec.BUFFER_FLAG_END_OF_STREAM
                            )
                            sawInputEOS = true
                        } else {
                            decoder.queueInputBuffer(
                                inputBufferIndex,
                                0,
                                sampleSize,
                                sampleTime,
                                0
                            )
                            extractor.advance()
                        }
                    }
                }
            }
            
            val outputBufferIndex = decoder.dequeueOutputBuffer(bufferInfo, 10000)
            if (outputBufferIndex >= 0) {
                val presentationTimeUs = bufferInfo.presentationTimeUs
                
                // Apply all effects
                outputSurface.awaitNewImage()
                outputSurface.drawImage {
                    renderer.renderFrame(
                        outputSurface.textureId,
                        presentationTimeUs,
                        clip.trimStartUs
                    )
                }
                outputSurface.setPresentationTime(presentationTimeUs * 1000)
                outputSurface.swapBuffers()
                
                decoder.releaseOutputBuffer(outputBufferIndex, true)
                
                // Handle encoder output
                while (true) {
                    val encoderStatus = encoder.dequeueOutputBuffer(bufferInfo, 0)
                    if (encoderStatus == MediaCodec.INFO_TRY_AGAIN_LATER) break
                    if (encoderStatus == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        // Format changed, continue
                    } else if (encoderStatus >= 0) {
                        val encodedBuffer = encoder.getOutputBuffer(encoderStatus)!!
                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                            bufferInfo.size = 0
                        }
                        
                        if (bufferInfo.size != 0) {
                            bufferInfo.presentationTimeUs = presentationTimeUs - clip.trimStartUs + presentationTimeOffset
                            encodedBuffer.position(bufferInfo.offset)
                            encodedBuffer.limit(bufferInfo.offset + bufferInfo.size)
                            muxer.writeSampleData(muxerTrackIndex, encodedBuffer, bufferInfo)
                            lastWrittenPts = bufferInfo.presentationTimeUs
                        }
                        
                        encoder.releaseOutputBuffer(encoderStatus, false)
                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                            sawOutputEOS = true
                            break
                        }
                    }
                }
            }
        }
        
        extractor.unselectTrack(videoTrack)
        decoder.stop()
        decoder.release()
        encoder.stop()
        encoder.release()
        outputSurface.release()
        
        return lastWrittenPts
    }
    
    private fun processAudio(
        extractor: MediaExtractor,
        audioTrack: Int,
        muxer: MediaMuxer,
        muxerTrackIndex: Int,
        clip: PreviewClip,
        presentationTimeOffset: Long
    ): Long {
        // Simple audio processing without effects
        val bufferSize = 1 * 1024 * 1024
        val buffer = java.nio.ByteBuffer.allocate(bufferSize)
        val bufferInfo = MediaCodec.BufferInfo()
        
        extractor.selectTrack(audioTrack)
        extractor.seekTo(clip.trimStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        
        var lastWrittenPts = presentationTimeOffset
        
        while (true) {
            val sampleTime = extractor.sampleTime
            if (sampleTime == -1L || sampleTime > clip.trimEndUs) break
            if (sampleTime < clip.trimStartUs) {
                extractor.advance()
                continue
            }
            
            bufferInfo.offset = 0
            bufferInfo.size = extractor.readSampleData(buffer, 0)
            if (bufferInfo.size < 0) break
            
            bufferInfo.presentationTimeUs = sampleTime - clip.trimStartUs + presentationTimeOffset
            bufferInfo.flags = extractor.sampleFlags
            
            muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)
            lastWrittenPts = bufferInfo.presentationTimeUs
            
            extractor.advance()
        }
        
        extractor.unselectTrack(audioTrack)
        return lastWrittenPts
    }
    
    private fun saveVideoToGallery(context: Context, file: File): String {
        val values = android.content.ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, file.name)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/AthleteSpark")
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("Failed to create new MediaStore record")
        
        resolver.openOutputStream(uri)?.use { outputStream ->
            java.io.FileInputStream(file).use { inputStream ->
                inputStream.copyTo(outputStream)
            }
        }
        
        values.clear()
        values.put(MediaStore.Video.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        
        return uri.toString()
    }
}

// Enhanced renderer that handles all preview effects
class PreviewRenderer(
    private val videoWidth: Int,
    private val videoHeight: Int,
    private val outputWidth: Int,
    private val outputHeight: Int,
    private val smartZoomKeyframes: List<FrameCenter>,
    private val markerKeyframes: List<MarkerKeyframe>,
    private val spotlightMode: String?,
    private val spotlightData: ReadableMap?,
    private val aspectRatio: ReadableMap?
) {
    
    fun renderFrame(textureId: Int, presentationTimeUs: Long, trimStartUs: Long) {
        val timeMs = (presentationTimeUs - trimStartUs) / 1000
        
        // Apply smart zoom transformations
        val smartZoomTransform = interpolateSmartZoom(timeMs)
        
        // Apply spotlight effects
        val spotlightTransform = interpolateSpotlight(timeMs)
        
        // Apply aspect ratio transformations
        val aspectRatioTransform = calculateAspectRatioTransform()
        
        // Combine all transformations and render
        // This would use OpenGL to apply all effects
        SmartZoomRenderer(videoWidth, videoHeight, outputWidth, outputHeight)
            .renderFrame(textureId, smartZoomTransform.centerX, smartZoomTransform.centerY, smartZoomTransform.zoom)
    }
    
    private fun interpolateSmartZoom(timeMs: Long): FrameCenter {
        if (smartZoomKeyframes.isEmpty()) return FrameCenter(timeMs, 0.5f, 0.5f, 1.0f)
        
        // Interpolation logic similar to SmartZoomProcessor
        val i = smartZoomKeyframes.indexOfLast { it.timeMs <= timeMs }
        if (i < 0) return smartZoomKeyframes.first()
        if (i >= smartZoomKeyframes.size - 1) return smartZoomKeyframes.last()
        
        val p1 = smartZoomKeyframes[i]
        val p2 = smartZoomKeyframes[i + 1]
        val t = ((timeMs - p1.timeMs).toFloat() / (p2.timeMs - p1.timeMs)).coerceIn(0f, 1f)
        
        return FrameCenter(
            timeMs,
            p1.centerX + (p2.centerX - p1.centerX) * t,
            p1.centerY + (p2.centerY - p1.centerY) * t,
            p1.zoom + (p2.zoom - p1.zoom) * t
        )
    }
    
    private fun interpolateSpotlight(timeMs: Long): FrameCenter {
        // Apply spotlight effects based on marker keyframes and spotlight mode
        // This would handle the player spotlight functionality
        return FrameCenter(timeMs, 0.5f, 0.5f, 1.0f)
    }
    
    private fun calculateAspectRatioTransform(): FrameCenter {
        // Calculate aspect ratio transformations
        // This would handle cropping/scaling to match the selected aspect ratio
        return FrameCenter(0, 0.5f, 0.5f, 1.0f)
    }
}
