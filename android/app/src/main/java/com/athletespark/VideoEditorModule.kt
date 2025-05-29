package com.athletespark

import android.content.Context
import android.media.*
import android.net.Uri
import android.os.Environment
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import android.content.ContentValues
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.provider.MediaStore
import java.io.FileInputStream
import java.io.IOException
import kotlin.concurrent.thread


data class VideoClip(val path: String, val trimStartUs: Long, val trimEndUs: Long)

class VideoEditorModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "VideoEditorModule"
  }

  private fun createOutputPath(fileName: String): String {
    val moviesDir = reactContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
    val outputFile = File(moviesDir, fileName)
    return outputFile.absolutePath
  }

  override fun getName(): String = "VideoEditor"

  @ReactMethod
  fun processVideo(options: ReadableMap, promise: Promise) {
    val type = options.getString("type")
    when (type) {
      "trim" -> handleTrim(options, promise)
      "merge" -> handleMerge(options, promise)
      else -> promise.reject("INVALID_TYPE", "Unsupported process type: $type")
    }
  }

  private fun handleTrim(options: ReadableMap, promise: Promise) {
    try {
      val inputPath = options.getString("path") ?: return promise.reject("MISSING_INPUT", "No input path")
      val startUs = (options.getDouble("trimStart") * 1_000_000L).toLong()
      val endUs = (options.getDouble("trimEnd") * 1_000_000L).toLong()
      val outputPath = options.getString("outputPath") ?: createOutputPath("trimmed_output.mp4")

      trimVideo(inputPath, outputPath, startUs, endUs)
      promise.resolve(outputPath)
    } catch (e: Exception) {
      promise.reject("TRIM_FAILED", e)
    }
  }

  private fun handleMerge(options: ReadableMap, promise: Promise) {
    try {
      val clips = options.getArray("clips") ?: return promise.reject("MISSING_CLIPS", "No clips provided")
      val outputPath = options.getString("outputPath") ?: createOutputPath("merged_output.mp4")

      val pathList = mutableListOf<Pair<String, Pair<Long, Long>>>()

      for (i in 0 until clips.size()) {
        val clip = clips.getMap(i)
        val path = clip?.getString("path") ?: continue
        val startUs = (clip.getDouble("trimStart") * 1_000_000L).toLong()
        val endUs = (clip.getDouble("trimEnd") * 1_000_000L).toLong()
        pathList.add(path to (startUs to endUs))
      }

      val clipsList = pathList.map { (path, range) -> VideoClip(path, range.first, range.second) }

      mergeVideos(
        context = reactContext,
        clips = clipsList,
        outputPath = outputPath,
        onComplete = { savedPath -> promise.resolve(savedPath) },
        onError = { error -> promise.reject("MERGE_FAILED", error) }
      )

    } catch (e: Exception) {
      promise.reject("MERGE_FAILED", e)
    }
  }

  private fun trimVideo(inputPath: String, outputPath: String, startUs: Long, endUs: Long) {
    val extractor = MediaExtractor()
    extractor.setDataSource(inputPath)

    val trackCount = extractor.trackCount
    var videoTrackIndex = -1
    var audioTrackIndex = -1

    for (i in 0 until trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("video/") && videoTrackIndex == -1) {
            videoTrackIndex = i
        } else if (mime.startsWith("audio/") && audioTrackIndex == -1) {
            audioTrackIndex = i
        }
    }

    val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val bufferSize = 1 * 1024 * 1024
    val buffer = ByteBuffer.allocate(bufferSize)
    val bufferInfo = MediaCodec.BufferInfo()

    fun writeTrack(trackIndex: Int, muxerTrackIndex: Int): Long {
        extractor.selectTrack(trackIndex)
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        var lastPts = 0L

        while (true) {
            val sampleTime = extractor.sampleTime
            if (sampleTime == -1L || sampleTime > endUs) break

            bufferInfo.offset = 0
            bufferInfo.size = extractor.readSampleData(buffer, 0)
            if (bufferInfo.size < 0) break

            bufferInfo.presentationTimeUs = sampleTime
            bufferInfo.flags = extractor.sampleFlags
            muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)
            extractor.advance()
            lastPts = sampleTime
        }

        extractor.unselectTrack(trackIndex)
        return lastPts
    }

    var videoMuxerTrack = -1
    var audioMuxerTrack = -1

    if (videoTrackIndex != -1) {
        val videoFormat = extractor.getTrackFormat(videoTrackIndex)
        videoMuxerTrack = muxer.addTrack(videoFormat)
    }

    if (audioTrackIndex != -1) {
        val audioFormat = extractor.getTrackFormat(audioTrackIndex)
        audioMuxerTrack = muxer.addTrack(audioFormat)
    }

    muxer.start()

    if (videoTrackIndex != -1) {
        writeTrack(videoTrackIndex, videoMuxerTrack)
    }

    if (audioTrackIndex != -1) {
        writeTrack(audioTrackIndex, audioMuxerTrack)
    }

    muxer.stop()
    muxer.release()
    extractor.release()
  }

  private fun mergeVideos(
    context: Context,
    clips: List<VideoClip>,
    outputPath: String,
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

                val bufferSize = 1 * 1024 * 1024
                val buffer = ByteBuffer.allocate(bufferSize)
                val bufferInfo = MediaCodec.BufferInfo()

                // Writes samples in the trimmed range and adjusts timestamps
                fun writeSamples(
                    trackIndex: Int,
                    extractorTrackIndex: Int,
                    trimStartUs: Long,
                    trimEndUs: Long,
                    presentationTimeOffset: Long
                ): Long {
                    extractor.selectTrack(extractorTrackIndex)
                    extractor.seekTo(trimStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

                    var lastWrittenPts = presentationTimeOffset

                    while (true) {
                        val sampleTime = extractor.sampleTime
                        if (sampleTime == -1L || sampleTime > trimEndUs) break
                        if (sampleTime < trimStartUs) {
                            extractor.advance()
                            continue
                        }

                        bufferInfo.offset = 0
                        bufferInfo.size = extractor.readSampleData(buffer, 0)
                        if (bufferInfo.size < 0) break

                        bufferInfo.presentationTimeUs = sampleTime - trimStartUs + presentationTimeOffset
                        bufferInfo.flags = extractor.sampleFlags

                        muxer.writeSampleData(trackIndex, buffer, bufferInfo)
                        lastWrittenPts = bufferInfo.presentationTimeUs

                        extractor.advance()
                    }

                    extractor.unselectTrack(extractorTrackIndex)
                    return lastWrittenPts
                }

                // Write video samples with trimming
                if (videoTrack != -1) {
                    videoPresentationTimeUsOffset = writeSamples(
                        videoTrackIndex,
                        videoTrack,
                        clip.trimStartUs,
                        clip.trimEndUs,
                        videoPresentationTimeUsOffset
                    )
                }

                // Write audio samples with trimming
                if (audioTrack != -1) {
                    audioPresentationTimeUsOffset = writeSamples(
                        audioTrackIndex,
                        audioTrack,
                        clip.trimStartUs,
                        clip.trimEndUs,
                        audioPresentationTimeUsOffset
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
            Log.e(TAG, "Failed to merge videos: ${e.message}", e)
            onError("Failed to merge videos: ${e.message}")
        }
    }
  }

  @ReactMethod
  private fun saveVideoToGallery(context: Context, file: File): String {
    val values = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, file.name)
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/AthleteSpark")
        put(MediaStore.Video.Media.IS_PENDING, 1)
    }

    val resolver = context.contentResolver
    val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IOException("Failed to create new MediaStore record")

    resolver.openOutputStream(uri)?.use { outputStream ->
        FileInputStream(file).use { inputStream ->
            inputStream.copyTo(outputStream)
        }
    }

    values.clear()
    values.put(MediaStore.Video.Media.IS_PENDING, 0)
    resolver.update(uri, values, null, null)

    return uri.toString()
  }
}
