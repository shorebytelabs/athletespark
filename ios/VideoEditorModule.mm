#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <AVFoundation/AVFoundation.h>
#import <Photos/Photos.h>

@interface VideoEditorModule : NSObject <RCTBridgeModule>
@end

@implementation VideoEditorModule

- (void)saveVideoToPhotos:(NSString *)videoPath {
  NSURL *videoURL = [NSURL fileURLWithPath:videoPath];

  [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
    [PHAssetChangeRequest creationRequestForAssetFromVideoAtFileURL:videoURL];
  } completionHandler:^(BOOL success, NSError * _Nullable error) {
    if (success) {
      NSLog(@"✅ Video saved to Photos");
    } else {
      NSLog(@"❌ Failed to save video: %@", error.localizedDescription);
    }
  }];
}

RCT_EXPORT_MODULE(VideoEditor);

#pragma mark - Helpers

- (void)saveToPhotoLibrary:(NSURL *)videoURL completion:(void (^)(BOOL success, NSError *error))completion {
  [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
    [PHAssetChangeRequest creationRequestForAssetFromVideoAtFileURL:videoURL];
  } completionHandler:^(BOOL success, NSError * _Nullable error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      completion(success, error);
    });
  }];
}

#pragma mark - Unified Entry Point

RCT_EXPORT_METHOD(processVideo:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *type = options[@"type"];
  if ([type isEqualToString:@"trim"]) {
    [self handleTrim:options resolver:resolve rejecter:reject];
  } else if ([type isEqualToString:@"merge"] || [type isEqualToString:@"concat"]) {
    [self handleMerge:options resolver:resolve rejecter:reject];
  } else if ([type isEqualToString:@"smartZoom"]) {
    [self handleSmartZoom:options resolver:resolve rejecter:reject];  
  } else if ([type isEqualToString:@"previewExport"]) {
    [self handlePreviewExport:options resolver:resolve rejecter:reject];
  } else if ([type isEqualToString:@"mergeWithAspectRatio"]) {
    [self handleMergeWithAspectRatio:options resolver:resolve rejecter:reject];
  } else {
    reject(@"unsupported_type", @"Unknown processing type", nil);
  }
}

#pragma mark - Save to camera roll

RCT_EXPORT_METHOD(saveToCameraRoll:(NSString *)videoPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *videoURL = [NSURL fileURLWithPath:videoPath];
  [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
    [PHAssetChangeRequest creationRequestForAssetFromVideoAtFileURL:videoURL];
  } completionHandler:^(BOOL success, NSError * _Nullable error) {
    if (success) {
      resolve(@(YES));
    } else {
      reject(@"save_error", @"Failed to save video to Photos", error);
    }
  }];
}


#pragma mark - Trim Handler

- (void)handleTrim:(NSDictionary *)options
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject {
  NSString *inputPath = options[@"inputPath"];
  NSString *outputPath = options[@"outputPath"];
  NSNumber *start = options[@"startTime"];
  NSNumber *end = options[@"endTime"];

  NSURL *inputURL = [NSURL fileURLWithPath:inputPath];
  NSURL *outputURL = [NSURL fileURLWithPath:outputPath];

  NSLog(@"[VideoEditor] Trimming video: %@", inputPath);

  NSString *outputDir = [outputPath stringByDeletingLastPathComponent];
  BOOL isDir;
  if (![[NSFileManager defaultManager] fileExistsAtPath:outputDir isDirectory:&isDir] || !isDir) {
    NSError *dirError = nil;
    [[NSFileManager defaultManager] createDirectoryAtPath:outputDir withIntermediateDirectories:YES attributes:nil error:&dirError];
    if (dirError) {
      reject(@"dir_create_failed", @"Failed to create output directory", dirError);
      return;
    }
  }

  if ([[NSFileManager defaultManager] fileExistsAtPath:[outputURL path]]) {
    NSError *removeError = nil;
    [[NSFileManager defaultManager] removeItemAtURL:outputURL error:&removeError];
    if (removeError) {
      reject(@"file_remove_error", @"Could not remove existing file at output path", removeError);
      return;
    }
  }

  AVAsset *asset = [AVAsset assetWithURL:inputURL];
  if (!asset) {
    reject(@"invalid_asset", @"Could not load video asset", nil);
    return;
  }

  CMTime startTime = CMTimeMakeWithSeconds([start doubleValue], asset.duration.timescale);
  CMTime endTime = CMTimeMakeWithSeconds([end doubleValue], asset.duration.timescale);

  if (CMTimeCompare(startTime, endTime) >= 0 || CMTimeCompare(endTime, asset.duration) > 0) {
    reject(@"invalid_trim", @"Invalid trim range", nil);
    return;
  }

  AVAssetExportSession *exportSession = [[AVAssetExportSession alloc] initWithAsset:asset presetName:AVAssetExportPresetHighestQuality];
  if (!exportSession) {
    reject(@"export_error", @"Could not create AVAssetExportSession", nil);
    return;
  }

  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    NSError *removeError = nil;
    [fileManager removeItemAtPath:outputPath error:&removeError];
    if (removeError) {
      NSLog(@"⚠️ Failed to delete existing file at outputPath: %@", removeError);
    }
  }

  exportSession.outputURL = outputURL;
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  
  // (Removed incorrect aspect-ratio block referencing out-of-scope variables)
  
  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    NSLog(@"🎬 MERGE: Export completed with status: %ld", (long)exportSession.status);
    switch (exportSession.status) {
      case AVAssetExportSessionStatusCompleted: {
        NSLog(@"✅ MERGE: Export successful");
        [self saveToPhotoLibrary:outputURL completion:^(BOOL success, NSError *error) {
          if (success) {
            NSLog(@"✅ MERGE: Saved to photo library");
            resolve(outputPath);
          } else {
            NSLog(@"❌ MERGE: Failed to save to photo library: %@", error.localizedDescription);
            reject(@"save_failed", @"Failed to save to photo library", error);
          }
        }];
        break;
      }
      case AVAssetExportSessionStatusFailed: {
        NSLog(@"❌ MERGE: Export failed: %@", exportSession.error.localizedDescription);
        reject(@"export_failed", exportSession.error.localizedDescription, exportSession.error);
        break;
      }
      case AVAssetExportSessionStatusCancelled: {
        NSLog(@"❌ MERGE: Export cancelled");
        reject(@"export_cancelled", @"Export cancelled", nil);
        break;
      }
      default: {
        NSLog(@"❌ MERGE: Unknown export status: %ld", (long)exportSession.status);
        reject(@"export_unknown", @"Unknown export status", exportSession.error);
        break;
      }
    }
  }];
}

#pragma mark - Merge Handler

- (void)handleMerge:(NSDictionary *)options
           resolver:(RCTPromiseResolveBlock)resolve
           rejecter:(RCTPromiseRejectBlock)reject {
  NSLog(@"🎬 MERGE: handleMerge called with options: %@", options);
  NSArray *clips = options[@"clips"];
  NSString *outputPath = options[@"outputPath"];
  NSDictionary *resolution = options[@"resolution"];

  AVMutableComposition *composition = [AVMutableComposition composition];
  CMTime currentTime = kCMTimeZero;

  AVMutableCompositionTrack *videoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
  AVMutableCompositionTrack *audioTrack = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];

  for (NSDictionary *clip in clips) {
    NSString *path = clip[@"path"];
    NSNumber *start = clip[@"trimStart"];
    NSNumber *end = clip[@"trimEnd"];

    if (!path || !start || !end) {
      reject(@"invalid_input", @"Missing clip path or trim times", nil);
      return;
    }

    NSURL *url = [NSURL fileURLWithPath:path];
    AVAsset *asset = [AVAsset assetWithURL:url];
    if (!asset) {
      reject(@"asset_load_failed", [NSString stringWithFormat:@"Failed to load asset at %@", path], nil);
      return;
    }

    CMTime duration = asset.duration;
    CMTime startTime = CMTimeMakeWithSeconds([start doubleValue], duration.timescale);
    CMTime endTime = CMTimeMakeWithSeconds([end doubleValue], duration.timescale);

    if (CMTIME_COMPARE_INLINE(startTime, >=, endTime) || CMTIME_COMPARE_INLINE(endTime, >, duration)) {
      reject(@"invalid_trim", @"Invalid trim range", nil);
      return;
    }

    CMTimeRange timeRange = CMTimeRangeFromTimeToTime(startTime, endTime);

    NSError *videoError = nil;
    AVAssetTrack *vTrack = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
    if (vTrack && ![videoTrack insertTimeRange:timeRange ofTrack:vTrack atTime:currentTime error:&videoError]) {
      reject(@"video_insert_failed", @"Failed to insert video", videoError);
      return;
    }

    AVAssetTrack *aTrack = [[asset tracksWithMediaType:AVMediaTypeAudio] firstObject];
    if (aTrack) {
      NSError *audioError = nil;
      [audioTrack insertTimeRange:timeRange ofTrack:aTrack atTime:currentTime error:&audioError];
    }

    currentTime = CMTimeAdd(currentTime, CMTimeSubtract(endTime, startTime));
  }

  NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
  [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];

  AVAssetExportSession *exportSession = [[AVAssetExportSession alloc] initWithAsset:composition presetName:AVAssetExportPresetHighestQuality];
  
  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    NSError *removeError = nil;
    [fileManager removeItemAtPath:outputPath error:&removeError];
    if (removeError) {
      NSLog(@"⚠️ Failed to delete existing file at outputPath: %@", removeError);
    }
  }

  exportSession.outputURL = outputURL;
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  
  // Apply aspect ratio transformations if provided
  NSLog(@"🎬 MERGE: Resolution parameter: %@", resolution);
  if (resolution) {
    CGFloat outputWidth = [resolution[@"width"] floatValue];
    CGFloat outputHeight = [resolution[@"height"] floatValue];
    NSLog(@"🎬 MERGE: Output dimensions: %.0fx%.0f", outputWidth, outputHeight);
    
    // Create video composition for aspect ratio
    AVMutableVideoComposition *videoComposition = [AVMutableVideoComposition videoComposition];
    videoComposition.frameDuration = CMTimeMake(1, 30);
    videoComposition.renderSize = CGSizeMake(outputWidth, outputHeight);
    
    // Create instruction for the entire composition
    AVMutableVideoCompositionInstruction *instruction = [AVMutableVideoCompositionInstruction videoCompositionInstruction];
    instruction.timeRange = CMTimeRangeMake(kCMTimeZero, composition.duration);
    
    AVMutableVideoCompositionLayerInstruction *layerInstruction = [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:videoTrack];
    
    // Calculate transform for aspect ratio
    AVAssetTrack *videoAssetTrack = [[composition tracksWithMediaType:AVMediaTypeVideo] firstObject];
    if (videoAssetTrack) {
      CGSize naturalSize = videoAssetTrack.naturalSize;
      NSLog(@"🎬 MERGE: Natural size: %@, Output size: %@", NSStringFromCGSize(naturalSize), NSStringFromCGSize(CGSizeMake(outputWidth, outputHeight)));
      
      CGAffineTransform transform = [self calculateAspectRatioTransform:naturalSize outputSize:CGSizeMake(outputWidth, outputHeight)];
      [layerInstruction setTransform:transform atTime:kCMTimeZero];
      
      // Also set opacity to ensure the video is visible
      [layerInstruction setOpacity:1.0 atTime:kCMTimeZero];
      
      NSLog(@"🎬 MERGE: Applied transform to video composition");
    } else {
      NSLog(@"❌ MERGE: No video track found in composition");
    }
    
    instruction.layerInstructions = @[layerInstruction];
    videoComposition.instructions = @[instruction];
    
    exportSession.videoComposition = videoComposition;
  } else {
    NSLog(@"🎬 MERGE: No resolution provided, using default export");
  }

  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    switch (exportSession.status) {
      case AVAssetExportSessionStatusCompleted: {
        [self saveToPhotoLibrary:outputURL completion:^(BOOL success, NSError *error) {
          if (success) {
            resolve(outputPath);
          } else {
            reject(@"save_failed", @"Failed to save to photo library", error);
          }
        }];
        break;
      }
      case AVAssetExportSessionStatusFailed: {
        reject(@"concat_export_failed", exportSession.error.localizedDescription, exportSession.error);
        break;
      }
      case AVAssetExportSessionStatusCancelled: {
        reject(@"concat_export_cancelled", @"Export cancelled", nil);
        break;
      }
      default: {
        reject(@"concat_export_unknown", @"Unknown export status", exportSession.error);
        break;
      }
    }
  }];
}

#pragma mark - Smart Zoom Helper (Interpolate CGAffineTransform)

- (CGAffineTransform)transformFrom:(NSDictionary *)start to:(NSDictionary *)end at:(CGFloat)t
                           frameSize:(CGSize)frameSize {
  CGFloat sx = [start[@"x"] floatValue];
  CGFloat sy = [start[@"y"] floatValue];
  CGFloat ex = [end[@"x"] floatValue];
  CGFloat ey = [end[@"y"] floatValue];

  CGFloat x = sx + (ex - sx) * t;
  CGFloat y = sy + (ey - sy) * t;

  CGFloat zoom = 2.0; // 2x zoom
  CGFloat tx = -x * frameSize.width + frameSize.width / 2.0;
  CGFloat ty = -y * frameSize.height + frameSize.height / 2.0;

  CGAffineTransform scale = CGAffineTransformMakeScale(zoom, zoom);
  CGAffineTransform translate = CGAffineTransformMakeTranslation(tx, ty);
  return CGAffineTransformConcat(scale, translate);
}

#pragma mark - Smart Zoom Handler

- (void)handleSmartZoom:(NSDictionary *)options
               resolver:(RCTPromiseResolveBlock)resolve
               rejecter:(RCTPromiseRejectBlock)reject {
  NSString *inputPath = options[@"videoUri"];
  NSString *outputPath = options[@"outputUri"];
  NSArray *keyframes = options[@"keyframes"];
  NSDictionary *frameSizeDict = options[@"frameSize"];

  NSLog(@"🎬 Smart Zoom input path: %@", inputPath);
  NSLog(@"📤 Smart Zoom output path: %@", outputPath);
  NSLog(@"📌 Keyframes: %@", keyframes);
  NSLog(@"📐 Frame size: %@", frameSizeDict);

  if (!inputPath || !outputPath || keyframes.count < 2) {
    reject(@"invalid_input", @"Missing input path, output path, or keyframes", nil);
    return;
  }

  AVAsset *asset = [AVAsset assetWithURL:[NSURL fileURLWithPath:inputPath]];
  AVAssetTrack *track = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
  if (!track) {
    reject(@"no_track", @"No video track found", nil);
    return;
  }

  CGSize frameSize = CGSizeZero;
  if (frameSizeDict[@"width"] && frameSizeDict[@"height"]) {
    CGFloat width = [frameSizeDict[@"width"] floatValue];
    CGFloat height = [frameSizeDict[@"height"] floatValue];
    if (width > 0 && height > 0) {
      frameSize = CGSizeMake(width, height);
    }
  }
  if (frameSize.width <= 0 || frameSize.height <= 0) {
    frameSize = track.naturalSize;
    NSLog(@"⚠️ Invalid or missing frameSize — fallback to natural size: %.1fx%.1f", frameSize.width, frameSize.height);
  }

  AVMutableComposition *composition = [AVMutableComposition composition];
  AVMutableCompositionTrack *videoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo
                                                                    preferredTrackID:kCMPersistentTrackID_Invalid];

  NSError *insertError = nil;
  [videoTrack insertTimeRange:CMTimeRangeMake(kCMTimeZero, asset.duration)
                      ofTrack:track
                       atTime:kCMTimeZero
                        error:&insertError];
  if (insertError) {
    reject(@"insert_error", @"Failed to insert track", insertError);
    return;
  }

  AVMutableVideoComposition *videoComposition = [AVMutableVideoComposition videoComposition];
  videoComposition.renderSize = frameSize;
  videoComposition.frameDuration = CMTimeMake(1, 30); // 30fps

  AVMutableVideoCompositionInstruction *instruction = [AVMutableVideoCompositionInstruction videoCompositionInstruction];
  instruction.timeRange = CMTimeRangeMake(kCMTimeZero, asset.duration);

  AVMutableVideoCompositionLayerInstruction *layerInstruction =
    [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:videoTrack];

  // ✅ Sort keyframes
  NSArray *sortedKeyframes = [keyframes sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    float t1 = [a[@"time"] floatValue];
    float t2 = [b[@"time"] floatValue];
    return t1 < t2 ? NSOrderedAscending : NSOrderedDescending;
  }];

  // ✅ Apply transform ramps between dense keyframe pairs
  for (NSInteger i = 0; i < sortedKeyframes.count - 1; i++) {
    NSDictionary *start = sortedKeyframes[i];
    NSDictionary *end = sortedKeyframes[i + 1];

    CGFloat startX = [start[@"x"] floatValue];
    CGFloat startY = [start[@"y"] floatValue];
    CGFloat endX = [end[@"x"] floatValue];
    CGFloat endY = [end[@"y"] floatValue];

    CGFloat startScale = [start[@"scale"] floatValue];
    CGFloat endScale = [end[@"scale"] floatValue];
    if (startScale <= 0) startScale = 1.0;
    if (endScale <= 0) endScale = 1.0;

    CMTime startTime = CMTimeMakeWithSeconds([start[@"time"] floatValue], 600);
    CMTime endTime = CMTimeMakeWithSeconds([end[@"time"] floatValue], 600);
    if (CMTIME_COMPARE_INLINE(endTime, <=, startTime)) continue;

    CGAffineTransform startTransform = CGAffineTransformConcat(
      CGAffineTransformMakeScale(startScale, startScale),
      CGAffineTransformMakeTranslation(
        -startX * frameSize.width * startScale + frameSize.width / 2.0,
        -startY * frameSize.height * startScale + frameSize.height / 2.0)
    );

    CGAffineTransform endTransform = CGAffineTransformConcat(
      CGAffineTransformMakeScale(endScale, endScale),
      CGAffineTransformMakeTranslation(
        -endX * frameSize.width * endScale + frameSize.width / 2.0,
        -endY * frameSize.height * endScale + frameSize.height / 2.0)
    );

    CMTimeRange timeRange = CMTimeRangeMake(startTime, CMTimeSubtract(endTime, startTime));
    [layerInstruction setTransformRampFromStartTransform:startTransform
                                          toEndTransform:endTransform
                                               timeRange:timeRange];
  }

  instruction.layerInstructions = @[layerInstruction];
  videoComposition.instructions = @[instruction];

  // 🔄 Set up export session
  AVAssetExportSession *exportSession = [AVAssetExportSession exportSessionWithAsset:composition
                                                                           presetName:AVAssetExportPresetHighestQuality];

  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    NSError *removeError = nil;
    [fileManager removeItemAtPath:outputPath error:&removeError];
    if (removeError) {
      NSLog(@"⚠️ Failed to delete existing output file: %@", removeError);
    }
  }

  exportSession.outputURL = [NSURL fileURLWithPath:outputPath];
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  exportSession.videoComposition = videoComposition;

  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    if (exportSession.status == AVAssetExportSessionStatusCompleted) {
      resolve(outputPath);
    } else {
      NSString *details = [NSString stringWithFormat:@"Status: %ld, Error: %@", (long)exportSession.status, exportSession.error.localizedDescription];
      reject(@"export_failed", details, exportSession.error);
    }
  }];
}

#pragma mark - Preview Export Handler

- (void)handlePreviewExport:(NSDictionary *)options
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject {
  NSLog(@"🎬 PREVIEW: handlePreviewExport called with options: %@", options);
  NSArray *clips = options[@"clips"];
  NSString *outputPath = options[@"outputPath"];
  NSDictionary *resolution = options[@"resolution"];
  NSDictionary *aspectRatio = options[@"aspectRatio"];
  
  if (!clips || !outputPath) {
    NSLog(@"❌ PREVIEW: Missing clips or outputPath");
    reject(@"invalid_input", @"Missing clips or outputPath", nil);
    return;
  }
  
  NSLog(@"🎬 PREVIEW: Starting preview export with %lu clips", (unsigned long)clips.count);
  
  // Create composition with all clips
  AVMutableComposition *composition = [AVMutableComposition composition];
  CMTime currentTime = kCMTimeZero;
  
  AVMutableCompositionTrack *videoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
  AVMutableCompositionTrack *audioTrack = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
  
  // Process each clip with its effects
  for (NSDictionary *clip in clips) {
    NSString *path = clip[@"path"];
    NSNumber *start = clip[@"trimStart"];
    NSNumber *end = clip[@"trimEnd"];
    
    // Handle null values properly
    NSArray *smartZoomKeyframes = nil;
    if (clip[@"smartZoomKeyframes"] && ![clip[@"smartZoomKeyframes"] isKindOfClass:[NSNull class]]) {
      smartZoomKeyframes = clip[@"smartZoomKeyframes"];
    }
    
    NSArray *markerKeyframes = nil;
    if (clip[@"markerKeyframes"] && ![clip[@"markerKeyframes"] isKindOfClass:[NSNull class]]) {
      markerKeyframes = clip[@"markerKeyframes"];
    }
    
    NSString *spotlightMode = nil;
    if (clip[@"spotlightMode"] && ![clip[@"spotlightMode"] isKindOfClass:[NSNull class]]) {
      spotlightMode = clip[@"spotlightMode"];
    }
    
    NSDictionary *spotlightData = nil;
    if (clip[@"spotlightData"] && ![clip[@"spotlightData"] isKindOfClass:[NSNull class]]) {
      spotlightData = clip[@"spotlightData"];
    }
    
    if (!path || !start || !end) {
      reject(@"invalid_clip", @"Missing clip path or trim times", nil);
      return;
    }
    
    NSURL *url = [NSURL fileURLWithPath:path];
    AVAsset *asset = [AVAsset assetWithURL:url];
    if (!asset) {
      reject(@"asset_load_failed", [NSString stringWithFormat:@"Failed to load asset at %@", path], nil);
      return;
    }
    
    CMTime duration = asset.duration;
    CMTime startTime = CMTimeMakeWithSeconds([start doubleValue], duration.timescale);
    CMTime endTime = CMTimeMakeWithSeconds([end doubleValue], duration.timescale);
    CMTimeRange timeRange = CMTimeRangeFromTimeToTime(startTime, endTime);
    
    // Insert video track
    NSError *videoError = nil;
    AVAssetTrack *vTrack = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
    if (vTrack && ![videoTrack insertTimeRange:timeRange ofTrack:vTrack atTime:currentTime error:&videoError]) {
      reject(@"video_insert_failed", @"Failed to insert video", videoError);
      return;
    }
    
    // Insert audio track
    AVAssetTrack *aTrack = [[asset tracksWithMediaType:AVMediaTypeAudio] firstObject];
    if (aTrack) {
      NSError *audioError = nil;
      [audioTrack insertTimeRange:timeRange ofTrack:aTrack atTime:currentTime error:&audioError];
    }
    
    currentTime = CMTimeAdd(currentTime, CMTimeSubtract(endTime, startTime));
  }
  
  // Create video composition with custom instructions
  AVMutableVideoComposition *videoComposition = [AVMutableVideoComposition videoComposition];
  videoComposition.frameDuration = CMTimeMake(1, 30); // 30 FPS
  videoComposition.renderSize = CGSizeMake([resolution[@"width"] floatValue], [resolution[@"height"] floatValue]);
  
  // Create composition instructions for each clip
  NSMutableArray *instructions = [NSMutableArray array];
  currentTime = kCMTimeZero;
  
  for (NSDictionary *clip in clips) {
    NSNumber *start = clip[@"trimStart"];
    NSNumber *end = clip[@"trimEnd"];
    
    // Handle null values properly
    NSArray *smartZoomKeyframes = nil;
    if (clip[@"smartZoomKeyframes"] && ![clip[@"smartZoomKeyframes"] isKindOfClass:[NSNull class]]) {
      smartZoomKeyframes = clip[@"smartZoomKeyframes"];
    }
    
    NSArray *markerKeyframes = nil;
    if (clip[@"markerKeyframes"] && ![clip[@"markerKeyframes"] isKindOfClass:[NSNull class]]) {
      markerKeyframes = clip[@"markerKeyframes"];
    }
    
    NSString *spotlightMode = nil;
    if (clip[@"spotlightMode"] && ![clip[@"spotlightMode"] isKindOfClass:[NSNull class]]) {
      spotlightMode = clip[@"spotlightMode"];
    }
    
    NSDictionary *spotlightData = nil;
    if (clip[@"spotlightData"] && ![clip[@"spotlightData"] isKindOfClass:[NSNull class]]) {
      spotlightData = clip[@"spotlightData"];
    }
    
    CMTime clipDuration = CMTimeMakeWithSeconds([end doubleValue] - [start doubleValue], 600);
    
    AVMutableVideoCompositionInstruction *instruction = [AVMutableVideoCompositionInstruction videoCompositionInstruction];
    instruction.timeRange = CMTimeRangeMake(currentTime, clipDuration);
    
    // Create layer instruction with transformations
    AVMutableVideoCompositionLayerInstruction *layerInstruction = [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:videoTrack];
    
    // Apply smart zoom transformations if available
    if (smartZoomKeyframes && smartZoomKeyframes.count > 0) {
      [self applySmartZoomTransforms:layerInstruction 
                           keyframes:smartZoomKeyframes 
                            timeRange:instruction.timeRange];
    }
    
    // Apply spotlight effects if available
    if (spotlightMode && spotlightData) {
      [self applySpotlightEffects:layerInstruction 
                     spotlightMode:spotlightMode 
                      spotlightData:spotlightData 
                         timeRange:instruction.timeRange];
    }
    
    // Apply aspect ratio transformations
    if (aspectRatio) {
      [self applyAspectRatioTransform:layerInstruction 
                          aspectRatio:aspectRatio 
                            timeRange:instruction.timeRange
                            videoTrack:videoTrack];
    }
    
    instruction.layerInstructions = @[layerInstruction];
    [instructions addObject:instruction];
    
    currentTime = CMTimeAdd(currentTime, clipDuration);
  }
  
  videoComposition.instructions = instructions;
  
  // Set up export session
  AVAssetExportSession *exportSession = [AVAssetExportSession exportSessionWithAsset:composition
                                                                           presetName:AVAssetExportPresetHighestQuality];
  
  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    NSError *removeError = nil;
    [fileManager removeItemAtPath:outputPath error:&removeError];
    if (removeError) {
      NSLog(@"⚠️ Failed to delete existing output file: %@", removeError);
    }
  }
  
  exportSession.outputURL = [NSURL fileURLWithPath:outputPath];
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  exportSession.videoComposition = videoComposition;
  
  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    if (exportSession.status == AVAssetExportSessionStatusCompleted) {
      [self saveToPhotoLibrary:[NSURL fileURLWithPath:outputPath] completion:^(BOOL success, NSError *error) {
        if (success) {
          resolve(outputPath);
        } else {
          reject(@"save_failed", @"Failed to save to photo library", error);
        }
      }];
    } else {
      NSString *details = [NSString stringWithFormat:@"Status: %ld, Error: %@", (long)exportSession.status, exportSession.error.localizedDescription];
      reject(@"export_failed", details, exportSession.error);
    }
  }];
}

#pragma mark - Preview Export Helper Methods

- (void)applySmartZoomTransforms:(AVMutableVideoCompositionLayerInstruction *)layerInstruction
                       keyframes:(NSArray *)keyframes
                        timeRange:(CMTimeRange)timeRange {
  // Apply smart zoom transformations based on keyframes
  // This would interpolate between keyframes and apply scale/translate transforms
  // Implementation would be similar to the existing smart zoom logic
}

- (void)applySpotlightEffects:(AVMutableVideoCompositionLayerInstruction *)layerInstruction
                 spotlightMode:(NSString *)spotlightMode
                  spotlightData:(NSDictionary *)spotlightData
                     timeRange:(CMTimeRange)timeRange {
  // Apply spotlight effects (overlay markers, freeze frames, etc.)
  // This would handle the player spotlight functionality
}

- (void)applyAspectRatioTransform:(AVMutableVideoCompositionLayerInstruction *)layerInstruction
                      aspectRatio:(NSDictionary *)aspectRatio
                        timeRange:(CMTimeRange)timeRange
                        videoTrack:(AVAssetTrack *)videoTrack {
  NSLog(@"🎬 PREVIEW: Applying aspect ratio transform");
  
  if (!videoTrack) {
    NSLog(@"❌ PREVIEW: No video track provided for aspect ratio transform");
    return;
  }
  
  CGSize naturalSize = videoTrack.naturalSize;
  CGSize outputSize = CGSizeMake([aspectRatio[@"width"] floatValue], [aspectRatio[@"height"] floatValue]);
  
  NSLog(@"🎬 PREVIEW: Natural size: %@, Output size: %@", NSStringFromCGSize(naturalSize), NSStringFromCGSize(outputSize));
  
  // Calculate the transform for aspect ratio
  CGAffineTransform transform = [self calculateAspectRatioTransform:naturalSize outputSize:outputSize];
  
  // Apply the transform
  [layerInstruction setTransform:transform atTime:timeRange.start];
  
  NSLog(@"🎬 PREVIEW: Applied aspect ratio transform");
}

- (CGAffineTransform)calculateAspectRatioTransform:(CGSize)naturalSize outputSize:(CGSize)outputSize {
  // Calculate aspect ratios
  CGFloat naturalAspectRatio = naturalSize.width / naturalSize.height;
  CGFloat outputAspectRatio = outputSize.width / outputSize.height;
  
  CGFloat scaleX, scaleY, translateX, translateY;
  
  NSLog(@"Natural: %.0fx%.0f (ratio: %.3f), Output: %.0fx%.0f (ratio: %.3f)", 
        naturalSize.width, naturalSize.height, naturalAspectRatio,
        outputSize.width, outputSize.height, outputAspectRatio);
  
  if (naturalAspectRatio > outputAspectRatio) {
    // Video is wider than output - scale to fit height, crop width (center crop)
    scaleY = outputSize.height / naturalSize.height;
    scaleX = scaleY;
    translateX = (outputSize.width - (naturalSize.width * scaleX)) / 2.0;
    translateY = 0;
    NSLog(@"🎬 PREVIEW: Video wider than output - scaling to fit height, cropping width");
  } else {
    // Video is taller than output - scale to fit width, crop height (center crop)
    scaleX = outputSize.width / naturalSize.width;
    scaleY = scaleX;
    translateX = 0;
    translateY = (outputSize.height - (naturalSize.height * scaleY)) / 2.0;
    NSLog(@"🎬 PREVIEW: Video taller than output - scaling to fit width, cropping height");
  }
  
  // Create the transform
  CGAffineTransform transform = CGAffineTransformMakeScale(scaleX, scaleY);
  transform = CGAffineTransformTranslate(transform, translateX / scaleX, translateY / scaleY);
  
  NSLog(@"🎬 PREVIEW: Transform: scale(%.3f, %.3f), translate(%.1f, %.1f)", scaleX, scaleY, translateX, translateY);
  
  return transform;
}

#pragma mark - Merge with Aspect Ratio Handler

- (void)handleMergeWithAspectRatio:(NSDictionary *)options
                          resolver:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject {
  NSArray *clips = options[@"clips"];
  NSString *outputPath = options[@"outputPath"];
  NSDictionary *resolution = options[@"resolution"];
  
  if (!clips || !outputPath) {
    reject(@"invalid_input", @"Missing clips or outputPath", nil);
    return;
  }
  
  // Create composition with all clips
  AVMutableComposition *composition = [AVMutableComposition composition];
  CMTime currentTime = kCMTimeZero;
  
  AVMutableCompositionTrack *videoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
  AVMutableCompositionTrack *audioTrack = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
  
  // Process each clip
  for (NSDictionary *clip in clips) {
    NSString *path = clip[@"path"];
    NSNumber *start = clip[@"trimStart"];
    NSNumber *end = clip[@"trimEnd"];
    
    if (!path || !start || !end) {
      reject(@"invalid_clip", @"Missing clip path or trim times", nil);
      return;
    }
    
    NSURL *url = [NSURL fileURLWithPath:path];
    AVAsset *asset = [AVAsset assetWithURL:url];
    if (!asset) {
      reject(@"asset_load_failed", [NSString stringWithFormat:@"Failed to load asset at %@", path], nil);
      return;
    }
    
    CMTime duration = asset.duration;
    CMTime startTime = CMTimeMakeWithSeconds([start doubleValue], duration.timescale);
    CMTime endTime = CMTimeMakeWithSeconds([end doubleValue], duration.timescale);
    CMTimeRange timeRange = CMTimeRangeFromTimeToTime(startTime, endTime);
    
    // Insert video track
    NSError *videoError = nil;
    AVAssetTrack *vTrack = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
    if (vTrack && ![videoTrack insertTimeRange:timeRange ofTrack:vTrack atTime:currentTime error:&videoError]) {
      reject(@"video_insert_failed", @"Failed to insert video", videoError);
      return;
    }
    
    // Insert audio track
    AVAssetTrack *aTrack = [[asset tracksWithMediaType:AVMediaTypeAudio] firstObject];
    if (aTrack) {
      NSError *audioError = nil;
      [audioTrack insertTimeRange:timeRange ofTrack:aTrack atTime:currentTime error:&audioError];
    }
    
    currentTime = CMTimeAdd(currentTime, CMTimeSubtract(endTime, startTime));
  }
  
  // Create video composition with proper aspect ratio handling
  AVMutableVideoComposition *videoComposition = [AVMutableVideoComposition videoComposition];
  videoComposition.frameDuration = CMTimeMake(1, 30);
  
  CGFloat outputWidth = 1920;
  CGFloat outputHeight = 1080;
  if (resolution) {
    outputWidth = [resolution[@"width"] floatValue];
    outputHeight = [resolution[@"height"] floatValue];
  }
  videoComposition.renderSize = CGSizeMake(outputWidth, outputHeight);
  
  // Create instruction for the entire composition
  AVMutableVideoCompositionInstruction *instruction = [AVMutableVideoCompositionInstruction videoCompositionInstruction];
  instruction.timeRange = CMTimeRangeMake(kCMTimeZero, composition.duration);
  
  AVMutableVideoCompositionLayerInstruction *layerInstruction = [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:videoTrack];
  
  // Get the natural size of the first video track
  AVAssetTrack *videoAssetTrack = [[composition tracksWithMediaType:AVMediaTypeVideo] firstObject];
  if (videoAssetTrack) {
    CGSize naturalSize = videoAssetTrack.naturalSize;
    NSLog(@"Natural size: %@, Output size: %@", NSStringFromCGSize(naturalSize), NSStringFromCGSize(CGSizeMake(outputWidth, outputHeight)));
    
    // Calculate the proper transform for aspect ratio
    CGAffineTransform transform = [self calculateProperAspectRatioTransform:naturalSize outputSize:CGSizeMake(outputWidth, outputHeight)];
    [layerInstruction setTransform:transform atTime:kCMTimeZero];
    [layerInstruction setOpacity:1.0 atTime:kCMTimeZero];
  }
  
  instruction.layerInstructions = @[layerInstruction];
  videoComposition.instructions = @[instruction];
  
  // Set up export session
  AVAssetExportSession *exportSession = [[AVAssetExportSession alloc] initWithAsset:composition presetName:AVAssetExportPresetHighestQuality];
  
  NSFileManager *fileManager = [NSFileManager defaultManager];
  if ([fileManager fileExistsAtPath:outputPath]) {
    NSError *removeError = nil;
    [fileManager removeItemAtPath:outputPath error:&removeError];
    if (removeError) {
      NSLog(@"⚠️ Failed to delete existing file at outputPath: %@", removeError);
    }
  }
  
  exportSession.outputURL = [NSURL fileURLWithPath:outputPath];
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  exportSession.videoComposition = videoComposition;
  
  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    if (exportSession.status == AVAssetExportSessionStatusCompleted) {
      [self saveToPhotoLibrary:[NSURL fileURLWithPath:outputPath] completion:^(BOOL success, NSError *error) {
        if (success) {
          resolve(outputPath);
        } else {
          reject(@"save_failed", @"Failed to save to photo library", error);
        }
      }];
    } else {
      NSString *details = [NSString stringWithFormat:@"Status: %ld, Error: %@", (long)exportSession.status, exportSession.error.localizedDescription];
      reject(@"export_failed", details, exportSession.error);
    }
  }];
}

- (CGAffineTransform)calculateProperAspectRatioTransform:(CGSize)naturalSize outputSize:(CGSize)outputSize {
  // Calculate aspect ratios
  CGFloat naturalAspectRatio = naturalSize.width / naturalSize.height;
  CGFloat outputAspectRatio = outputSize.width / outputSize.height;
  
  CGFloat scaleX, scaleY, translateX, translateY;
  
  if (naturalAspectRatio > outputAspectRatio) {
    // Video is wider than output - scale to fit width, crop height
    scaleX = outputSize.width / naturalSize.width;
    scaleY = scaleX;
    translateX = 0;
    translateY = (outputSize.height - (naturalSize.height * scaleY)) / 2.0;
  } else {
    // Video is taller than output - scale to fit height, crop width
    scaleY = outputSize.height / naturalSize.height;
    scaleX = scaleY;
    translateX = (outputSize.width - (naturalSize.width * scaleX)) / 2.0;
    translateY = 0;
  }
  
  // Create the transform
  CGAffineTransform transform = CGAffineTransformMakeScale(scaleX, scaleY);
  transform = CGAffineTransformTranslate(transform, translateX / scaleX, translateY / scaleY);
  
  NSLog(@"Transform: scale(%.2f, %.2f), translate(%.2f, %.2f)", scaleX, scaleY, translateX, translateY);
  
  return transform;
}

@end
