# Preview Export Implementation

## Overview

This implementation enhances the batch export functionality to capture the exact same view as the video preview, including all effects, transformations, and overlays.

## What Was Missing

The original batch export only captured:
- ✅ Trim settings
- ❌ Aspect ratio transformations
- ❌ Smart zoom effects
- ❌ Player spotlight effects
- ❌ Overlay markers

## Implementation Details

### 1. Enhanced Data Structure

Updated the batch export to pass all preview data:

```javascript
const clipsToMerge = clips.map(clip => ({
  path: uriToPath(clip.uri),
  trimStart: clip.trimStart ?? 0,
  trimEnd: clip.trimEnd ?? clip.duration,
  smartZoomKeyframes: Array.isArray(clip.smartZoomKeyframes) ? clip.smartZoomKeyframes : null,
  markerKeyframes: Array.isArray(clip.markerKeyframes) ? clip.markerKeyframes : null,
  spotlightMode: clip.spotlightMode || null,
  spotlightData: clip.spotlightData || null,
}));
```

### 2. New Export Type

Created a new export type `previewExport` that processes all preview effects:

```javascript
const mergedVideoPath = await VideoEditorNativeModule.process({
  type: 'previewExport', // New export type that captures preview view
  clips: clipsToMerge,
  outputPath,
  resolution: outputResolution,
  aspectRatio: aspectRatio,
});
```

### 3. iOS Implementation (AVFoundation + AVVideoComposition)

**File**: `ios/VideoEditorModule.mm`

- Added `handlePreviewExport` method
- Uses `AVVideoComposition` with custom instructions
- Applies smart zoom transformations via `AVMutableVideoCompositionLayerInstruction`
- Handles spotlight effects and aspect ratio transformations
- Helper methods for each effect type:
  - `applySmartZoomTransforms`
  - `applySpotlightEffects` 
  - `applyAspectRatioTransform`

### 4. Android Implementation (MediaCodec + OpenGL)

**Files**: 
- `android/app/src/main/java/com/athletespark/videoeditor/VideoEditorModule.kt`
- `android/app/src/main/java/com/athletespark/videoeditor/PreviewExportProcessor.kt`

- Added `handlePreviewExport` method
- Created `PreviewExportProcessor` class for complex video processing
- Uses `MediaCodec` with OpenGL rendering
- Enhanced `PreviewRenderer` that combines all effects:
  - Smart zoom transformations
  - Spotlight effects
  - Aspect ratio transformations
  - Overlay markers

### 5. Data Classes

Added new data structures for Android:

```kotlin
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
```

## How It Works

### iOS Flow
1. Creates `AVMutableComposition` with all clips
2. Creates `AVVideoComposition` with custom instructions
3. For each clip, applies transformations via `AVMutableVideoCompositionLayerInstruction`
4. Uses `AVAssetExportSession` with the custom video composition
5. Saves to photo library

### Android Flow
1. Creates `MediaMuxer` for output
2. For each clip, uses `MediaCodec` decoder/encoder pipeline
3. Applies effects via `PreviewRenderer` with OpenGL
4. Combines smart zoom, spotlight, and aspect ratio transformations
5. Saves to gallery

## Key Features

### Smart Zoom
- Interpolates between keyframes using Catmull-Rom spline
- Applies scale and translate transformations
- Matches the preview rendering exactly

### Spotlight Effects
- Handles player spotlight modes
- Applies overlay markers at correct timestamps
- Manages freeze frame effects

### Aspect Ratio
- Crops/scales video to match selected aspect ratio
- Maintains video quality during transformation

### Overlay Markers
- Renders markers at correct positions and timestamps
- Supports different marker types (circle, emoji, gif)
- Handles freeze duration effects

## Usage

The enhanced export is automatically used when clicking "Batch Export All Clips". No changes needed in the UI - the export now captures everything visible in the preview.

## Testing

To test the implementation:

1. Create a project with multiple clips
2. Apply smart zoom, spotlight, and aspect ratio settings
3. Click "Batch Export All Clips"
4. Verify the exported video matches the preview exactly

## Future Enhancements

- Add progress callbacks for long exports
- Optimize performance for large projects
- Add export quality settings
- Support for additional overlay types
