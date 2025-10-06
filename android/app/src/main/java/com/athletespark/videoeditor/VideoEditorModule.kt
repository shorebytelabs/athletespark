package com.athletespark.videoeditor

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
import com.athletespark.videoeditor.model.FrameCenter
import com.athletespark.videoeditor.SmartZoomProcessor
import com.athletespark.videoeditor.PreviewExportProcessor

data class VideoClip(val path: String, val trimStartUs: Long, val trimEndUs: Long)

data class MarkerKeyframe(
  val timestamp: Double,
  val x: Float,
  val y: Float,
  val markerType: String,
  val freezeDuration: Double
)

data class PreviewClip(
  val path: String,
  val trimStartUs: Long,
  val trimEndUs: Long,
  val smartZoomKeyframes: List<FrameCenter>,
  val markerKeyframes: List<MarkerKeyframe>,
  val spotlightMode: String?,
  val spotlightData: ReadableMap?
)

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
      "smartZoom" -> handleSmartZoom(options, promise)
      "previewExport" -> handlePreviewExport(options, promise)
      "mergeWithAspectRatio" -> handleMergeWithAspectRatio(options, promise)
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
      val resolution = options.getMap("resolution")

      val pathList = mutableListOf<Pair<String, Pair<Long, Long>>>()

      for (i in 0 until clips.size()) {
        val clip = clips.getMap(i)
        val path = clip?.getString("path") ?: continue
        val startUs = (clip.getDouble("trimStart") * 1_000_000L).toLong()
        val endUs = (clip.getDouble("trimEnd") * 1_000_000L).toLong()
        pathList.add(path to (startUs to endUs))
      }

      val clipsList = pathList.map { (path, range) -> VideoClip(path, range.first, range.second) }

      mergeVideosWithAspectRatio(
        context = reactContext,
        clips = clipsList,
        outputPath = outputPath,
        resolution = resolution,
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

  private fun mergeVideosWithAspectRatio(
    context: Context,
    clips: List<VideoClip>,
    outputPath: String,
    resolution: ReadableMap?,
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
                        // Apply aspect ratio transformation if resolution is provided
                        if (resolution != null) {
                            val outputWidth = resolution.getInt("width")
                            val outputHeight = resolution.getInt("height")
                            
                            // Create a new format with the desired output dimensions
                            val mimeType = videoFormat.getString(MediaFormat.KEY_MIME) ?: "video/avc"
                            val newVideoFormat = MediaFormat.createVideoFormat(
                                mimeType,
                                outputWidth,
                                outputHeight
                            )
                            
                            // Copy other important properties
                            if (videoFormat.containsKey(MediaFormat.KEY_BIT_RATE)) {
                                newVideoFormat.setInteger(MediaFormat.KEY_BIT_RATE, videoFormat.getInteger(MediaFormat.KEY_BIT_RATE))
                            }
                            if (videoFormat.containsKey(MediaFormat.KEY_FRAME_RATE)) {
                                newVideoFormat.setInteger(MediaFormat.KEY_FRAME_RATE, videoFormat.getInteger(MediaFormat.KEY_FRAME_RATE))
                            }
                            if (videoFormat.containsKey(MediaFormat.KEY_COLOR_FORMAT)) {
                                newVideoFormat.setInteger(MediaFormat.KEY_COLOR_FORMAT, videoFormat.getInteger(MediaFormat.KEY_COLOR_FORMAT))
                            }
                            
                            videoTrackIndex = muxer.addTrack(newVideoFormat)
                        } else {
                            videoTrackIndex = muxer.addTrack(videoFormat)
                        }
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
            Log.e(TAG, "Failed to merge videos with aspect ratio: ${e.message}", e)
            onError("Failed to merge videos: ${e.message}")
        }
    }
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

  private fun handleSmartZoom(options: ReadableMap, promise: Promise) {
    try {
      val inputPath = options.getString("videoUri") ?: return promise.reject("E_MISSING_INPUT", "Missing videoUri")
      val outputPath = options.getString("outputUri") ?: return promise.reject("E_MISSING_OUTPUT", "Missing outputUri")
      val keyframesArray = options.getArray("keyframes") ?: return promise.reject("E_MISSING_KEYFRAMES", "Missing keyframes")

      val keyframes = mutableListOf<FrameCenter>()
      for (i in 0 until keyframesArray.size()) {
        val frameMap = keyframesArray.getMap(i)
        val timeMs = frameMap?.getDouble("timeMs")?.toLong() ?: continue
        val centerX = frameMap.getDouble("centerX").toFloat()
        val centerY = frameMap.getDouble("centerY").toFloat()
        keyframes.add(FrameCenter(timeMs, centerX, centerY))
      }

      val outputWidth = options.getInt("outputWidth")
      val outputHeight = options.getInt("outputHeight")

      SmartZoomProcessor(reactApplicationContext).processSmartZoom(
          inputPath,
          outputPath,
          keyframes,
          outputWidth,
          outputHeight
      ) { success ->
        if (success && File(outputPath).exists()) {
          val result = Arguments.createMap().apply {
            putString("output", outputPath)
          }
          promise.resolve(result)
        } else {
          promise.reject("PROCESS_FAILED", "Smart zoom processing failed or output not found")
        }
      }
    } catch (e: Exception) {
      promise.reject("PROCESS_EXCEPTION", "Exception during smart zoom processing", e)
    }
  }

  private fun handlePreviewExport(options: ReadableMap, promise: Promise) {
    try {
      val clips = options.getArray("clips") ?: return promise.reject("MISSING_CLIPS", "No clips provided")
      val outputPath = options.getString("outputPath") ?: createOutputPath("preview_export.mp4")
      val resolution = options.getMap("resolution")
      val aspectRatio = options.getMap("aspectRatio")

      val outputWidth = resolution?.getInt("width") ?: 1920
      val outputHeight = resolution?.getInt("height") ?: 1080

      // Process clips with all preview effects
      val clipsList = mutableListOf<PreviewClip>()
      
      for (i in 0 until clips.size()) {
        val clip = clips.getMap(i)
        val path = clip?.getString("path") ?: continue
        val startUs = (clip.getDouble("trimStart") * 1_000_000L).toLong()
        val endUs = (clip.getDouble("trimEnd") * 1_000_000L).toLong()
        
        // Extract smart zoom keyframes
        val smartZoomKeyframes = mutableListOf<FrameCenter>()
        val smartZoomArray = clip.getArray("smartZoomKeyframes")
        if (smartZoomArray != null && smartZoomArray.size() > 0) {
          for (j in 0 until smartZoomArray.size()) {
            val frameMap = smartZoomArray.getMap(j)
            val timeMs = frameMap?.getDouble("timeMs")?.toLong() ?: continue
            val centerX = frameMap.getDouble("centerX").toFloat()
            val centerY = frameMap.getDouble("centerY").toFloat()
            val zoom = frameMap.getDouble("zoom").toFloat()
            smartZoomKeyframes.add(FrameCenter(timeMs, centerX, centerY, zoom))
          }
        }
        
        // Extract marker keyframes
        val markerKeyframes = mutableListOf<MarkerKeyframe>()
        val markerArray = clip.getArray("markerKeyframes")
        if (markerArray != null && markerArray.size() > 0) {
          for (j in 0 until markerArray.size()) {
            val markerMap = markerArray.getMap(j)
            val timestamp = markerMap?.getDouble("timestamp") ?: continue
            val x = markerMap.getDouble("x").toFloat()
            val y = markerMap.getDouble("y").toFloat()
            val markerType = markerMap.getString("markerType") ?: "circle"
            val freezeDuration = markerMap.getDouble("freezeDuration")
            markerKeyframes.add(MarkerKeyframe(timestamp, x, y, markerType, freezeDuration))
          }
        }
        
        val spotlightMode = clip.getString("spotlightMode")
        val spotlightData = clip.getMap("spotlightData")
        
        clipsList.add(PreviewClip(
          path = path,
          trimStartUs = startUs,
          trimEndUs = endUs,
          smartZoomKeyframes = smartZoomKeyframes,
          markerKeyframes = markerKeyframes,
          spotlightMode = spotlightMode,
          spotlightData = spotlightData
        ))
      }

      // Use enhanced processor for preview export
      PreviewExportProcessor(reactApplicationContext).processPreviewExport(
        clips = clipsList,
        outputPath = outputPath,
        outputWidth = outputWidth,
        outputHeight = outputHeight,
        aspectRatio = aspectRatio,
        onComplete = { savedPath -> promise.resolve(savedPath) },
        onError = { error -> promise.reject("PREVIEW_EXPORT_FAILED", error) }
      )

    } catch (e: Exception) {
      promise.reject("PREVIEW_EXPORT_EXCEPTION", "Exception during preview export", e)
    }
  }

  private fun handleMergeWithAspectRatio(options: ReadableMap, promise: Promise) {
    try {
      val clips = options.getArray("clips") ?: return promise.reject("MISSING_CLIPS", "No clips provided")
      val outputPath = options.getString("outputPath") ?: createOutputPath("merged_with_aspect_ratio.mp4")
      val resolution = options.getMap("resolution")

      val pathList = mutableListOf<Pair<String, Pair<Long, Long>>>()

      for (i in 0 until clips.size()) {
        val clip = clips.getMap(i)
        val path = clip?.getString("path") ?: continue
        val startUs = (clip.getDouble("trimStart") * 1_000_000L).toLong()
        val endUs = (clip.getDouble("trimEnd") * 1_000_000L).toLong()
        pathList.add(path to (startUs to endUs))
      }

      val clipsList = pathList.map { (path, range) -> VideoClip(path, range.first, range.second) }

      mergeVideosWithAspectRatio(
        context = reactContext,
        clips = clipsList,
        outputPath = outputPath,
        resolution = resolution,
        onComplete = { savedPath -> promise.resolve(savedPath) },
        onError = { error -> promise.reject("MERGE_WITH_ASPECT_RATIO_FAILED", error) }
      )

    } catch (e: Exception) {
      promise.reject("MERGE_WITH_ASPECT_RATIO_EXCEPTION", "Exception during merge with aspect ratio", e)
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