package com.athletespark.videoeditor

import com.athletespark.videoeditor.model.FrameCenter
import android.content.Context
import android.media.*
import android.opengl.EGL14
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.view.Surface
import java.io.File
import java.nio.ByteBuffer

class SmartZoomProcessor(private val context: Context) {

    fun processSmartZoom(
        inputPath: String,
        outputPath: String,
        keyframes: List<FrameCenter>,
        outputWidth: Int,
        outputHeight: Int,
        onComplete: (Boolean) -> Unit
    ) {
        val extractor = MediaExtractor()
        extractor.setDataSource(inputPath)

        val trackIndex = (0 until extractor.trackCount).first {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
        }

        extractor.selectTrack(trackIndex)
        val inputFormat = extractor.getTrackFormat(trackIndex)
        val mime = inputFormat.getString(MediaFormat.KEY_MIME)!!
        val videoWidth = inputFormat.getInteger(MediaFormat.KEY_WIDTH)
        val videoHeight = inputFormat.getInteger(MediaFormat.KEY_HEIGHT)

        val decoder = MediaCodec.createDecoderByType(mime)
        val encoderFormat = MediaFormat.createVideoFormat(mime, outputWidth, outputHeight).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, 5_000_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 30)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        }

        val encoder = MediaCodec.createEncoderByType(mime)
        val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        encoder.configure(encoderFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val inputSurface = encoder.createInputSurface()
        encoder.start()

        val outputSurface = CodecOutputSurface(videoWidth, videoHeight, outputWidth, outputHeight)
        decoder.configure(inputFormat, outputSurface.surface, null, 0)
        decoder.start()

        val renderer = SmartZoomRenderer(videoWidth, videoHeight, outputWidth, outputHeight)

        val bufferInfo = MediaCodec.BufferInfo()
        var outputTrackIndex = -1
        var sawInputEOS = false
        var sawOutputEOS = false

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
                        decoder.queueInputBuffer(
                            inputBufferIndex,
                            0,
                            sampleSize,
                            extractor.sampleTime,
                            0
                        )
                        extractor.advance()
                    }
                }
            }

            val outputBufferIndex = decoder.dequeueOutputBuffer(bufferInfo, 10000)
            if (outputBufferIndex >= 0) {
                val presentationTimeUs = bufferInfo.presentationTimeUs
                val interpolated = interpolateKeyframes(presentationTimeUs, keyframes)

                outputSurface.awaitNewImage()
                outputSurface.drawImage {
                    renderer.renderFrame(outputSurface.textureId, interpolated.centerX, interpolated.centerY, interpolated.zoom)
                }
                outputSurface.setPresentationTime(presentationTimeUs * 1000)
                outputSurface.swapBuffers()

                decoder.releaseOutputBuffer(outputBufferIndex, true)

                // Feed encoder and write output
                while (true) {
                    val encoderStatus = encoder.dequeueOutputBuffer(bufferInfo, 0)
                    if (encoderStatus == MediaCodec.INFO_TRY_AGAIN_LATER) break
                    if (encoderStatus == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        outputTrackIndex = muxer.addTrack(encoder.outputFormat)
                        muxer.start()
                    } else if (encoderStatus >= 0) {
                        val encodedBuffer = encoder.getOutputBuffer(encoderStatus)!!
                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                            bufferInfo.size = 0
                        }

                        if (bufferInfo.size != 0) {
                            encodedBuffer.position(bufferInfo.offset)
                            encodedBuffer.limit(bufferInfo.offset + bufferInfo.size)
                            muxer.writeSampleData(outputTrackIndex, encodedBuffer, bufferInfo)
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

        extractor.release()
        decoder.stop()
        decoder.release()
        encoder.stop()
        encoder.release()
        muxer.stop()
        muxer.release()
        outputSurface.release()

        onComplete(true)
    }

    private fun interpolateKeyframes(timeUs: Long, keyframes: List<FrameCenter>): FrameCenter {
        if (keyframes.isEmpty()) return FrameCenter(timeUs, 0.5f, 0.5f)

        val ms = timeUs / 1000
        val before = keyframes.lastOrNull { it.timeMs <= ms } ?: keyframes.first()
        val after = keyframes.firstOrNull { it.timeMs > ms } ?: keyframes.last()

        if (before == after) return before

        val fraction = (ms - before.timeMs).toFloat() / (after.timeMs - before.timeMs)
        val centerX = before.centerX + (after.centerX - before.centerX) * fraction
        val centerY = before.centerY + (after.centerY - before.centerY) * fraction
        val zoom = 2.0f // fixed zoom for now

        return FrameCenter(ms, centerX, centerY, zoom)
    }
}
