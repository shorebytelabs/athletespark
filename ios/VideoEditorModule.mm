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
  exportSession.timeRange = CMTimeRangeFromTimeToTime(startTime, endTime);

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
        reject(@"export_failed", exportSession.error.localizedDescription, exportSession.error);
        break;
      }
      case AVAssetExportSessionStatusCancelled: {
        reject(@"export_cancelled", @"Export cancelled", nil);
        break;
      }
      default: {
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
  NSArray *clips = options[@"clips"];
  NSString *outputPath = options[@"outputPath"];

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

@end
