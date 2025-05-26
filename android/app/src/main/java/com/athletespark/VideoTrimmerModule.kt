package com.athletespark

import android.net.Uri
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.*
import java.io.File

@UnstableApi
class VideoTrimmerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VideoTrimmer"
    }

    @ReactMethod
    fun trimVideo(inputPath: String, outputPath: String, startMs: Double, endMs: Double, promise: Promise) {
        try {
            val inputFile = File(inputPath)
            val outputFile = File(outputPath)
            if (!inputFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "Input file does not exist.")
                return
            }

            val startUs = (startMs * 1000).toLong()
            val endUs = (endMs * 1000).toLong()

            val mediaItem = MediaItem.Builder()
                .setUri(Uri.fromFile(inputFile))
                .setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionUs(startUs)
                        .setEndPositionUs(endUs)
                        .build()
                )
                .build()

            val transformer = Transformer.Builder(reactContext)
                .addListener(object : Transformer.Listener {
                    override fun onTransformationCompleted(inputMediaItem: MediaItem) {
                        promise.resolve(outputPath)
                    }

                    override fun onTransformationError(inputMediaItem: MediaItem, exception: Exception) {
                        promise.reject("TRANSFORMATION_FAILED", exception.message, exception)
                    }
                })
                .build()

            transformer.startTransformation(mediaItem, outputPath)

        } catch (e: Exception) {
            Log.e("VideoTrimmer", "Error trimming video", e)
            promise.reject("TRIM_ERROR", e.message, e)
        }
    }
}
