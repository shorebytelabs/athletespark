package com.athletespark.videoeditor

import android.content.Context
import android.media.*
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import kotlin.concurrent.thread
import android.content.ContentValues

class VideoEditorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "VideoEditorModule"
  }

  override fun getName(): String = "VideoEditor"

  @ReactMethod
    fun process(options: ReadableMap, promise: Promise) {
        val type = options.getString("type") ?: "merge"
        val clips = options.getArray("clips") ?: WritableNativeArray()
        val resolution = options.getMap("resolution")
        
        // Handle aspectRatio as either a string or a map
        val aspectRatio: String? = when {
            options.hasKey("aspectRatio") && !options.isNull("aspectRatio") -> {
                try {
                    // First try to get it as a string
                    val aspectRatioString = options.getString("aspectRatio")
                    if (aspectRatioString != null) {
                        aspectRatioString
                    } else {
                        // If not a string, try to get it as a map
                        val aspectRatioMap = options.getMap("aspectRatio")
                        aspectRatioMap?.getString("name") ?: "16:9"
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error parsing aspectRatio: ${e.message}")
                    "16:9"
                }
            }
            else -> null
        }
        
        Log.d(TAG, "Processing type: $type")
        Log.d(TAG, "Clips count: ${clips.size()}")
        Log.d(TAG, "Resolution: $resolution")
        Log.d(TAG, "Aspect ratio: $aspectRatio")

    when (type) {
            "previewExport" -> handlePreviewExport(clips, resolution, aspectRatio, promise)
            "merge" -> handleMerge(clips, resolution, promise)
            else -> promise.reject("UNKNOWN_TYPE", "Unknown processing type: $type")
        }
    }

    private fun handlePreviewExport(
        clips: ReadableArray,
        resolution: ReadableMap?,
        aspectRatio: String?,
        promise: Promise
    ) {
        try {
            Log.d(TAG, "=== PREVIEW EXPORT START ===")
            Log.d(TAG, "Clips count: ${clips.size()}")
            Log.d(TAG, "Resolution: $resolution")
            Log.d(TAG, "Aspect ratio: $aspectRatio")
            
            // If resolution is provided, process each clip separately and then merge
            if (resolution != null) {
                val outputWidth = resolution.getInt("width")
                val outputHeight = resolution.getInt("height")
                
                Log.d(TAG, "Processing clips with aspect ratio transformation: ${outputWidth}x${outputHeight}")
                
                val videoClips = parseVideoClips(clips)
                val outputPath = createOutputPath("preview_export.mp4")
                
                // Process clips separately and merge
                processClipsWithAspectRatio(
                    videoClips = videoClips,
                    outputPath = outputPath,
                    outputWidth = outputWidth,
                    outputHeight = outputHeight,
                    promise = promise
                )
            } else {
                // No resolution specified, fall back to basic merge
                Log.d(TAG, "No resolution specified, falling back to basic merge")
                handleMerge(clips, resolution, promise)
            }
    } catch (e: Exception) {
            Log.e(TAG, "Preview export error: ${e.message}", e)
            promise.reject("PREVIEW_EXPORT_ERROR", e.message)
        }
    }

    private fun processClipsWithAspectRatio(
        videoClips: List<VideoClip>,
        outputPath: String,
        outputWidth: Int,
        outputHeight: Int,
        promise: Promise
    ) {
        thread {
            try {
                Log.d(TAG, "=== PROCESSING CLIPS WITH ASPECT RATIO ===")
                Log.d(TAG, "Clips: ${videoClips.size}")
                Log.d(TAG, "Target resolution: ${outputWidth}x${outputHeight}")
                
                val transformedClips = mutableListOf<File>()
                
                // Process each clip separately with aspect ratio transformation
                for ((index, clip) in videoClips.withIndex()) {
                    Log.d(TAG, "=== PROCESSING CLIP $index ===")
                    
                    val tempOutputPath = File(reactApplicationContext.cacheDir, "temp_clip_${index}_${System.currentTimeMillis()}.mp4").absolutePath
                    
                    val processor = AspectRatioProcessor(reactApplicationContext)
                    var processingComplete = false
                    var processingError: String? = null
                    
                    processor.processWithAspectRatio(
                        clips = listOf(
                            AspectRatioProcessor.ProcessingClip(
                                path = clip.path,
                                trimStartUs = clip.trimStartUs,
                                trimEndUs = clip.trimEndUs
                            )
                        ),
                        outputPath = tempOutputPath,
                        outputWidth = outputWidth,
                        outputHeight = outputHeight,
                        onComplete = {
                            transformedClips.add(File(tempOutputPath))
                            processingComplete = true
                            Log.d(TAG, "Clip $index transformed successfully")
                        },
                        onError = { error ->
                            processingError = error
                            processingComplete = true
                            Log.e(TAG, "Clip $index transformation failed: $error")
                        }
                    )
                    
                    // Wait for processing to complete (with timeout)
                    var timeoutCounter = 0
                    val maxTimeout = 600 // 60 seconds (600 * 100ms)
                    
                    while (!processingComplete && timeoutCounter < maxTimeout) {
                        Thread.sleep(100)
                        timeoutCounter++
                    }
                    
                    if (!processingComplete) {
                        Log.e(TAG, "Clip $index processing timed out after ${maxTimeout / 10} seconds")
                        throw Exception("Clip $index processing timed out")
                    }
                    
                    if (processingError != null) {
                        throw Exception("Failed to process clip $index: $processingError")
                    }
                }
                
                Log.d(TAG, "=== ALL CLIPS TRANSFORMED ===")
                Log.d(TAG, "Transformed clips: ${transformedClips.size}")
                
                // Now merge the transformed clips using basic merge (no aspect ratio needed)
                val transformedVideoClips = transformedClips.mapIndexed { index, file ->
                    // Get the actual duration of each transformed clip
                    var duration = 10_000_000L // Default 10 seconds
                    try {
                        val retriever = MediaMetadataRetriever()
                        retriever.setDataSource(file.absolutePath)
                        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 10000L
                        duration = durationMs * 1000 // Convert to microseconds
                        retriever.release()
                        Log.d(TAG, "Transformed clip $index duration: ${duration}us")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to get duration for clip $index: ${e.message}")
                    }
                    
                    VideoClip(
                        path = file.absolutePath,
                        trimStartUs = 0L, // Already trimmed
                        trimEndUs = duration // Use actual clip duration
                    )
                }
                
                mergeVideosWithAspectRatio(
                    reactApplicationContext,
                    transformedVideoClips,
                    outputPath,
                    null, // No resolution needed - already transformed
                    onComplete = { result ->
                        Log.d(TAG, "=== FINAL MERGE COMPLETE ===")
                        Log.d(TAG, "Final video: $result")
                        
                        // Clean up temporary files
                        transformedClips.forEach { 
                            Log.d(TAG, "Deleting temp file: ${it.absolutePath}")
                            it.delete() 
                        }
                        
                        Log.d(TAG, "All temporary files cleaned up")
                        promise.resolve(result)
                    },
                    onError = { error ->
                        Log.e(TAG, "Final merge failed: $error")
                        
                        // Clean up temporary files
                        transformedClips.forEach { it.delete() }
                        promise.reject("MERGE_FAILED", error)
                    }
                )

    } catch (e: Exception) {
                Log.e(TAG, "Error processing clips with aspect ratio: ${e.message}", e)
                promise.reject("PROCESSING_ERROR", e.message)
            }
        }
    }
    
    private fun handleMerge(
        clips: ReadableArray,
        resolution: ReadableMap?,
        promise: Promise
    ) {
        try {
            val videoClips = parseVideoClips(clips)
            val outputPath = createOutputPath("merged_output.mp4")
            
            Log.d(TAG, "=== MERGE START ===")
            Log.d(TAG, "Clips: ${videoClips.size}")
            Log.d(TAG, "Output path: $outputPath")
            
            mergeVideosWithAspectRatio(
                reactApplicationContext,
                videoClips,
                outputPath,
                resolution,
                onComplete = { result ->
                    Log.d(TAG, "Merge completed: $result")
                    promise.resolve(result)
                },
                onError = { error ->
                    Log.e(TAG, "Merge failed: $error")
                    promise.reject("MERGE_FAILED", error)
                }
            )
        } catch (e: Exception) {
            Log.e(TAG, "Merge error: ${e.message}", e)
            promise.reject("MERGE_ERROR", e.message)
        }
    }

    private fun parseVideoClips(clips: ReadableArray): List<VideoClip> {
        val videoClips = mutableListOf<VideoClip>()
        
        for (i in 0 until clips.size()) {
            val clip = clips.getMap(i) ?: continue
            val path = clip.getString("path") ?: continue
            val trimStart = clip.getDouble("trimStart") ?: 0.0
            val trimEnd = clip.getDouble("trimEnd") ?: 0.0
            
            videoClips.add(
                VideoClip(
                    path = path,
                    trimStartUs = (trimStart * 1_000_000).toLong(),
                    trimEndUs = (trimEnd * 1_000_000).toLong()
                )
            )
        }
        
        return videoClips
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
            var muxer: MediaMuxer? = null
            var muxerStarted = false
            var muxerStopped = false
            val muxerLock = Any()
            var tempFile: File? = null
            
            try {
                // Create a temporary file in the app's cache directory first
                tempFile = File(context.cacheDir, "temp_merged_${System.currentTimeMillis()}.mp4")
                Log.d(TAG, "=== MEDIA MUXER CREATION ===")
                Log.d(TAG, "Temp file path: ${tempFile.absolutePath}")
                Log.d(TAG, "Temp file name: ${tempFile.name}")
                Log.d(TAG, "Temp file extension: ${tempFile.extension}")
                
                muxer = MediaMuxer(tempFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
                Log.d(TAG, "MediaMuxer created successfully")

    var videoTrackIndex = -1
    var audioTrackIndex = -1

                var presentationTimeUsOffset = 0L

                for ((clipIndex, clip) in clips.withIndex()) {
                    Log.d(TAG, "=== PROCESSING CLIP ${clipIndex} ===")
                    Log.d(TAG, "Clip path: ${clip.path}")
                    val inputUri = Uri.fromFile(File(clip.path))
                    val extractor = MediaExtractor()
                    
                    try {
                        extractor.setDataSource(context, inputUri, null)

                        val trackCount = extractor.trackCount
                        var videoTrack = -1
                        var audioTrack = -1

                        // Select tracks
                        Log.d(TAG, "=== TRACK SELECTION ===")
                        Log.d(TAG, "Track count: $trackCount")
    for (i in 0 until trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                            Log.d(TAG, "Track $i: $mime")
                            if (mime.startsWith("video/") && videoTrack == -1) {
                                videoTrack = i
                                Log.d(TAG, "Selected video track: $i")
                            } else if (mime.startsWith("audio/") && audioTrack == -1) {
                                audioTrack = i
                                Log.d(TAG, "Selected audio track: $i")
                            }
                        }
                        Log.d(TAG, "Final video track: $videoTrack")
                        Log.d(TAG, "Final audio track: $audioTrack")

                        // Add tracks once (from first clip)
                        if (!muxerStarted) {
                            // Add audio track first (some muxers prefer this order)
                            if (audioTrack != -1) {
                                val audioFormat = extractor.getTrackFormat(audioTrack)
                                audioTrackIndex = muxer.addTrack(audioFormat)
                                Log.d(TAG, "=== AUDIO TRACK ADDED ===")
                                Log.d(TAG, "Audio track index: $audioTrackIndex")
                            }
                            
                            if (videoTrack != -1) {
                                val videoFormat = extractor.getTrackFormat(videoTrack)
                                Log.d(TAG, "Original video format: $videoFormat")
                                
                                // If resolution is provided, create a new format with the desired dimensions
                                if (resolution != null) {
                                    val outputWidth = resolution.getInt("width")
                                    val outputHeight = resolution.getInt("height")
                                    
                                    Log.d(TAG, "Applying aspect ratio: ${outputWidth}x${outputHeight}")
                                    
                                    // For aspect ratio handling, we need to use the original video format
                                    // and let the muxer handle the transformation
                                    // Don't create a new format - use the original one
                                    Log.d(TAG, "Using original video format for aspect ratio handling")
                                    videoTrackIndex = muxer.addTrack(videoFormat)
                                    Log.d(TAG, "=== VIDEO TRACK ADDED ===")
                                    Log.d(TAG, "Video track index: $videoTrackIndex")
                                    Log.d(TAG, "Video format MIME: ${videoFormat.getString(MediaFormat.KEY_MIME)}")
                                    Log.d(TAG, "Video format width: ${videoFormat.getInteger(MediaFormat.KEY_WIDTH)}")
                                    Log.d(TAG, "Video format height: ${videoFormat.getInteger(MediaFormat.KEY_HEIGHT)}")
                                } else {
                                    // No resolution specified, use original format
                                    videoTrackIndex = muxer.addTrack(videoFormat)
                                    Log.d(TAG, "=== VIDEO TRACK ADDED ===")
                                    Log.d(TAG, "Video track index: $videoTrackIndex")
                                    Log.d(TAG, "Video format MIME: ${videoFormat.getString(MediaFormat.KEY_MIME)}")
                                    Log.d(TAG, "Video format width: ${videoFormat.getInteger(MediaFormat.KEY_WIDTH)}")
                                    Log.d(TAG, "Video format height: ${videoFormat.getInteger(MediaFormat.KEY_HEIGHT)}")
                                }
                            }
                            
                            Log.d(TAG, "=== STARTING MUXER ===")
                            Log.d(TAG, "Video track index: $videoTrackIndex")
                            Log.d(TAG, "Audio track index: $audioTrackIndex")
                            Log.d(TAG, "Muxer started: $muxerStarted")
                            
                            muxer.start()
                            muxerStarted = true
                            
                            Log.d(TAG, "Muxer started successfully")
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
                            Log.d(TAG, "=== WRITE SAMPLES START ===")
                            Log.d(TAG, "Track index: $trackIndex")
                            Log.d(TAG, "Extractor track index: $extractorTrackIndex")
                            Log.d(TAG, "Trim start: ${trimStartUs}us")
                            Log.d(TAG, "Trim end: ${trimEndUs}us")
                            Log.d(TAG, "Presentation time offset: ${presentationTimeOffset}us")
                            
                            extractor.selectTrack(extractorTrackIndex)
                            extractor.seekTo(trimStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

                            var lastWrittenPts = presentationTimeOffset
                            var sampleCount = 0

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
                                sampleCount++

            extractor.advance()
                            }

                            Log.d(TAG, "=== WRITE SAMPLES END ===")
                            Log.d(TAG, "Samples written: $sampleCount")
                            Log.d(TAG, "Final presentation time: $lastWrittenPts")

                            extractor.unselectTrack(extractorTrackIndex)
                            return lastWrittenPts
                        }

                        // Write video and audio samples with trimming
                        var videoEndPts = presentationTimeUsOffset
                        var audioEndPts = presentationTimeUsOffset
                        
                        if (videoTrack != -1) {
                            Log.d(TAG, "=== WRITING VIDEO SAMPLES ===")
                            Log.d(TAG, "Writing video samples for clip ${clipIndex}...")
                            videoEndPts = writeSamples(
                                videoTrackIndex,
                                videoTrack,
                                clip.trimStartUs,
                                clip.trimEndUs,
                                presentationTimeUsOffset
                            )
                            Log.d(TAG, "Finished writing video samples for clip ${clipIndex}")
                        } else {
                            Log.w(TAG, "No video track found for clip ${clipIndex}")
                        }

                        if (audioTrack != -1) {
                            Log.d(TAG, "=== WRITING AUDIO SAMPLES ===")
                            Log.d(TAG, "Writing audio samples for clip ${clipIndex}...")
                            audioEndPts = writeSamples(
                                audioTrackIndex,
                                audioTrack,
                                clip.trimStartUs,
                                clip.trimEndUs,
                                presentationTimeUsOffset
                            )
                            Log.d(TAG, "Finished writing audio samples for clip ${clipIndex}")
                        } else {
                            Log.w(TAG, "No audio track found for clip ${clipIndex}")
                        }
                        
                        // Use the maximum of video and audio end times for the next clip
                        // This ensures proper sync and prevents transition glitches
                        val maxEndPts = maxOf(videoEndPts, audioEndPts)
                        
                        // Calculate the actual duration of this clip (trimEnd - trimStart)
                        val clipDuration = clip.trimEndUs - clip.trimStartUs
                        Log.d(TAG, "Clip ${clipIndex} duration: ${clipDuration}us (${clipDuration / 1000}ms)")
                        
                        // The next offset should be the current offset + the actual clip duration
                        // This ensures seamless transitions without gaps
                        presentationTimeUsOffset = presentationTimeUsOffset + clipDuration
                        
                        Log.d(TAG, "Calculated next offset: $presentationTimeUsOffset (current: ${presentationTimeUsOffset - clipDuration} + duration: $clipDuration)")
                        
                        Log.d(TAG, "=== CLIP ${clipIndex} COMPLETE ===")
                        Log.d(TAG, "Video end PTS: $videoEndPts")
                        Log.d(TAG, "Audio end PTS: $audioEndPts")
                        Log.d(TAG, "Next offset (with buffer): $presentationTimeUsOffset")

                    } finally {
                        extractor.release()
                    }
                }

                // Only stop and release muxer if it was started successfully and not already stopped
                synchronized(muxerLock) {
                    if (muxerStarted && muxer != null && !muxerStopped) {
                        try {
                            Log.d(TAG, "Stopping muxer...")
                            muxer.stop()
                            muxerStopped = true
                            Log.d(TAG, "Muxer stopped successfully")
                        } catch (e: Exception) {
                            Log.w(TAG, "Error stopping muxer: ${e.message}")
                            // Continue execution even if stop fails
                        }
                    } else {
                        Log.d(TAG, "Skipping muxer stop - started: $muxerStarted, muxer: ${muxer != null}, stopped: $muxerStopped")
                    }
                }
                
                if (muxer != null && !muxerStopped) {
                    try {
                        muxer.release()
                        Log.w(TAG, "Muxer released successfully")
                    } catch (e: Exception) {
                        Log.w(TAG, "Error releasing muxer: ${e.message}")
                    }
                }

                // Copy temporary file to final destination and save to gallery
                val finalFile = File(outputPath)
                
                Log.d(TAG, "=== FILE COPY START ===")
                Log.d(TAG, "Temp file path: ${tempFile?.absolutePath}")
                Log.d(TAG, "Temp file exists: ${tempFile?.exists()}")
                Log.d(TAG, "Temp file size: ${tempFile?.length()} bytes")
                Log.d(TAG, "Final file path: ${finalFile.absolutePath}")
                Log.d(TAG, "Final file name: ${finalFile.name}")
                
                tempFile?.copyTo(finalFile, overwrite = true)
                tempFile?.delete() // Clean up temporary file
                
                Log.d(TAG, "After copy - Final file exists: ${finalFile.exists()}")
                Log.d(TAG, "After copy - Final file size: ${finalFile.length()} bytes")
                Log.d(TAG, "After copy - Final file extension: ${finalFile.extension}")
                
                // Test if the video file is actually playable
                try {
                    val retriever = MediaMetadataRetriever()
                    retriever.setDataSource(finalFile.absolutePath)
                    val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                    val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                    val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                    val mimeType = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
                    retriever.release()
                    
                    Log.d(TAG, "=== VIDEO METADATA ===")
                    Log.d(TAG, "Duration: $duration ms")
                    Log.d(TAG, "Width: $width")
                    Log.d(TAG, "Height: $height")
                    Log.d(TAG, "MIME type: $mimeType")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to read video metadata: ${e.message}")
                }
                
                // Ensure the final file has the correct .mp4 extension
                if (!finalFile.name.endsWith(".mp4")) {
                    val mp4File = File(finalFile.parent, finalFile.nameWithoutExtension + ".mp4")
                    Log.d(TAG, "Renaming file from ${finalFile.name} to ${mp4File.name}")
                    val renameSuccess = finalFile.renameTo(mp4File)
                    Log.d(TAG, "Rename success: $renameSuccess")
                    if (renameSuccess) {
                        val savedPath = saveVideoToGallery(context, mp4File)
                        onComplete(savedPath)
                    } else {
                        Log.e(TAG, "Failed to rename file to .mp4")
                        val savedPath = saveVideoToGallery(context, finalFile)
                        onComplete(savedPath)
                    }
                } else {
                    Log.d(TAG, "File already has .mp4 extension")
                    val savedPath = saveVideoToGallery(context, finalFile)
                    onComplete(savedPath)
                }

            } catch (e: Exception) {
                Log.e(TAG, "Failed to merge videos with aspect ratio: ${e.message}", e)
                
                // Ensure muxer is properly cleaned up even on error
                if (muxer != null) {
                    try {
                        synchronized(muxerLock) {
                            if (muxerStarted && !muxerStopped) {
                                Log.d(TAG, "Stopping muxer during cleanup...")
    muxer.stop()
                                muxerStopped = true
                                Log.d(TAG, "Muxer stopped during cleanup")
                            } else {
                                Log.d(TAG, "Skipping muxer stop during cleanup - started: $muxerStarted, stopped: $muxerStopped")
                            }
                        }
                    } catch (stopException: Exception) {
                        Log.w(TAG, "Error stopping muxer during cleanup: ${stopException.message}")
                    }
                    try {
    muxer.release()
                    } catch (releaseException: Exception) {
                        Log.w(TAG, "Error releasing muxer during cleanup: ${releaseException.message}")
                    }
                }
                
                // Clean up temporary file on error
                try {
                    if (tempFile != null && tempFile.exists()) { // Use nullable check
                        tempFile.delete()
                    }
                } catch (cleanupException: Exception) {
                    Log.w(TAG, "Error cleaning up temporary file: ${cleanupException.message}")
                }
                
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
            var muxer: MediaMuxer? = null
            var muxerStarted = false
            var muxerStopped = false
            val muxerLock = Any()
            
        try {
                muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
                Log.d(TAG, "MediaMuxer created successfully")

            var videoTrackIndex = -1
            var audioTrackIndex = -1

            var videoPresentationTimeUsOffset = 0L
            var audioPresentationTimeUsOffset = 0L

            for ((clipIndex, clip) in clips.withIndex()) {
                val inputUri = Uri.fromFile(File(clip.path))
                val extractor = MediaExtractor()
                    
                    try {
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

                    } finally {
                extractor.release()
                    }
            }

                // Only stop and release muxer if it was started successfully and not already stopped
                synchronized(muxerLock) {
                    if (muxerStarted && muxer != null && !muxerStopped) {
                        try {
                            Log.d(TAG, "Stopping muxer...")
            muxer.stop()
                            muxerStopped = true
                            Log.d(TAG, "Muxer stopped successfully")
                        } catch (e: Exception) {
                            Log.w(TAG, "Error stopping muxer: ${e.message}")
                            // Continue execution even if stop fails
                        }
                    } else {
                        Log.d(TAG, "Skipping muxer stop - started: $muxerStarted, muxer: ${muxer != null}, stopped: $muxerStopped")
                    }
                }
                
                if (muxer != null && !muxerStopped) {
                    try {
            muxer.release()
                        Log.w(TAG, "Muxer released successfully")
                    } catch (e: Exception) {
                        Log.w(TAG, "Error releasing muxer: ${e.message}")
                    }
                }

            val savedPath = saveVideoToGallery(context, File(outputPath))
            onComplete(savedPath)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to merge videos: ${e.message}", e)
                
                // Ensure muxer is properly cleaned up even on error
                if (muxer != null) {
                    try {
                        synchronized(muxerLock) {
                            if (muxerStarted && !muxerStopped) {
                                Log.d(TAG, "Stopping muxer during cleanup...")
                                muxer.stop()
                                muxerStopped = true
                                Log.d(TAG, "Muxer stopped during cleanup")
                            } else {
                                Log.d(TAG, "Skipping muxer stop during cleanup - started: $muxerStarted, stopped: $muxerStopped")
                            }
                        }
                    } catch (stopException: Exception) {
                        Log.w(TAG, "Error stopping muxer during cleanup: ${stopException.message}")
                    }
                    try {
                        muxer.release()
                    } catch (releaseException: Exception) {
                        Log.w(TAG, "Error releasing muxer during cleanup: ${releaseException.message}")
                    }
                }
                
            onError("Failed to merge videos: ${e.message}")
        }
    }
  }

    private fun saveVideoToGallery(context: Context, file: File): String {
        try {
            Log.d(TAG, "=== SAVE VIDEO TO GALLERY START ===")
            Log.d(TAG, "Input file: ${file.absolutePath}")
            Log.d(TAG, "Input file name: ${file.name}")
            Log.d(TAG, "Input file exists: ${file.exists()}")
            Log.d(TAG, "Input file size: ${file.length()} bytes")
            
            // Ensure the file has a proper .mp4 extension
            val fileName = if (file.name.endsWith(".mp4")) {
                file.name
            } else {
                val newName = file.name.replace(Regex("\\.(mov|avi|mkv)$"), ".mp4")
                Log.d(TAG, "Renamed file from ${file.name} to $newName")
                newName
            }
            
            Log.d(TAG, "Final filename for MediaStore: $fileName")
            
    val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4") // Always use video/mp4
                put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/AthleteSpark")
        put(MediaStore.Video.Media.IS_PENDING, 1)
                put(MediaStore.Video.Media.SIZE, file.length())
                put(MediaStore.Video.Media.DATE_ADDED, System.currentTimeMillis() / 1000)
                put(MediaStore.Video.Media.DATE_MODIFIED, System.currentTimeMillis() / 1000)
                put(MediaStore.Video.Media.DURATION, 0) // Will be updated by media scanner
    }

    val resolver = context.contentResolver
    val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IOException("Failed to create new MediaStore record")

            Log.d(TAG, "Created MediaStore URI: ${uri}")

    resolver.openOutputStream(uri)?.use { outputStream ->
        FileInputStream(file).use { inputStream ->
                    val bytesCopied = inputStream.copyTo(outputStream)
                    Log.d(TAG, "Copied $bytesCopied bytes to MediaStore")
                }
            }

            // Mark as no longer pending so it appears in gallery
            values.clear()
            values.put(MediaStore.Video.Media.IS_PENDING, 0)
            val updateResult = resolver.update(uri, values, null, null)
            Log.d(TAG, "Updated MediaStore record: $updateResult rows affected")

            // Trigger media scan to ensure the video appears in gallery
            try {
                // Always use video/mp4 MIME type since we ensure .mp4 extension
                val mimeType = "video/mp4"
                
                Log.d(TAG, "=== MEDIA SCANNING START ===")
                Log.d(TAG, "Scanning file: ${file.absolutePath}")
                Log.d(TAG, "Using MIME type: $mimeType")
                Log.d(TAG, "File extension: ${file.extension}")
                
                android.media.MediaScannerConnection.scanFile(
                    context,
                    arrayOf(file.absolutePath),
                    arrayOf(mimeType),
                    null
                )
                Log.d(TAG, "MediaScannerConnection.scanFile completed")
                
                // Also try the broadcast approach for older Android versions
                try {
                    val intent = android.content.Intent(android.content.Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
                    intent.data = Uri.fromFile(file)
                    context.sendBroadcast(intent)
                    Log.d(TAG, "Sent media scan broadcast for file: ${file.absolutePath}")
                } catch (broadcastException: Exception) {
                    Log.w(TAG, "Media scan broadcast failed: ${broadcastException.message}")
                }
                
                // Force a media refresh using a different approach
                try {
                    val refreshIntent = android.content.Intent(android.content.Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
                    refreshIntent.data = Uri.parse("file://${file.parent}")
                    context.sendBroadcast(refreshIntent)
                    Log.d(TAG, "Sent media refresh broadcast for directory: ${file.parent}")
                } catch (refreshException: Exception) {
                    Log.w(TAG, "Media refresh broadcast failed: ${refreshException.message}")
                }
            } catch (scanException: Exception) {
                Log.w(TAG, "MediaScannerConnection failed: ${scanException.message}")
            }

            Log.d(TAG, "Video saved to gallery: ${uri}")
            return uri.toString()
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save video to gallery: ${e.message}", e)
            // Fallback: try to save to a more accessible location
            try {
                val publicDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AthleteSpark")
                if (!publicDir.exists()) {
                    publicDir.mkdirs()
                }
                
                // Ensure proper .mp4 extension
                val fileName = if (file.name.endsWith(".mp4")) {
                    file.name
                } else {
                    file.name.replace(Regex("\\.(mov|avi|mkv)$"), ".mp4")
                }
                
                val publicFile = File(publicDir, fileName)
                file.copyTo(publicFile, overwrite = true)
                
                Log.d(TAG, "Saved to fallback location: ${publicFile.absolutePath}")
                
                // Trigger media scan for the fallback file
                try {
                    android.media.MediaScannerConnection.scanFile(
                        context,
                        arrayOf(publicFile.absolutePath),
                        arrayOf("video/mp4"),
                        null
                    )
                    Log.d(TAG, "Triggered media scan for fallback file: ${publicFile.absolutePath}")
                } catch (scanException: Exception) {
                    Log.w(TAG, "MediaScannerConnection failed for fallback: ${scanException.message}")
                }
                
                return publicFile.absolutePath
                
            } catch (fallbackException: Exception) {
                Log.e(TAG, "Fallback save also failed: ${fallbackException.message}", fallbackException)
                throw IOException("Failed to save video to gallery: ${e.message}")
            }
        }
    }

    private fun createOutputPath(fileName: String): String {
        // Use public Movies directory instead of app's external files directory
        val moviesDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AthleteSpark")
        if (!moviesDir.exists()) {
            moviesDir.mkdirs()
        }
        
        // Add timestamp to prevent overwriting and ensure .mp4 extension
        val timestamp = System.currentTimeMillis()
        val baseName = fileName.replace(Regex("\\.(mp4|mov|avi|mkv)$"), "")
        val properFileName = "${baseName}_${timestamp}.mp4"
        val outputFile = File(moviesDir, properFileName)
        
        Log.d(TAG, "=== CREATE OUTPUT PATH ===")
        Log.d(TAG, "Input fileName: $fileName")
        Log.d(TAG, "Base name: $baseName")
        Log.d(TAG, "Proper file name: $properFileName")
        Log.d(TAG, "Output path: ${outputFile.absolutePath}")
        Log.d(TAG, "Directory exists: ${moviesDir.exists()}")
        Log.d(TAG, "Directory path: ${moviesDir.absolutePath}")
        
        return outputFile.absolutePath
    }
}

data class VideoClip(
    val path: String,
    val trimStartUs: Long,
    val trimEndUs: Long
)