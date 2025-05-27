#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <AVFoundation/AVFoundation.h>
#import <Photos/Photos.h>

@interface VideoEditorModule : NSObject <RCTBridgeModule>
@end

@implementation VideoEditorModule

RCT_EXPORT_MODULE(VideoEditorModule);

// ✅ Save to Photos helper
- (void)saveToPhotoLibrary:(NSURL *)videoURL completion:(void (^)(BOOL success, NSError *error))completion {
  [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
    [PHAssetChangeRequest creationRequestForAssetFromVideoAtFileURL:videoURL];
  } completionHandler:^(BOOL success, NSError * _Nullable error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      completion(success, error);
    });
  }];
}

// ✅ Trim a video
RCT_EXPORT_METHOD(trimVideo:(NSString *)inputPath
                  startTime:(nonnull NSNumber *)start
                  endTime:(nonnull NSNumber *)end
                  outputPath:(NSString *)outputPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *inputURL = [NSURL fileURLWithPath:inputPath];
  NSURL *outputURL = [NSURL fileURLWithPath:outputPath];

  NSLog(@"[VideoEditor] Trimming video: %@", inputPath);
  NSLog(@"[VideoEditor] Output path: %@", outputPath);

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

  AVAssetExportSession *exportSession = [[AVAssetExportSession alloc]
                                         initWithAsset:asset
                                         presetName:AVAssetExportPresetHighestQuality];
  if (!exportSession) {
    reject(@"export_error", @"Could not create AVAssetExportSession", nil);
    return;
  }

  exportSession.outputURL = outputURL;
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  exportSession.timeRange = CMTimeRangeFromTimeToTime(startTime, endTime);

  NSLog(@"[VideoEditor] Trimming from %.2f to %.2f seconds", [start doubleValue], [end doubleValue]);

  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    switch (exportSession.status) {
      case AVAssetExportSessionStatusCompleted: {
        NSLog(@"[VideoEditor] Trim export completed");
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
        NSLog(@"[VideoEditor] Trim export failed: %@", exportSession.error.localizedDescription);
        reject(@"export_failed", exportSession.error.localizedDescription, exportSession.error);
        break;
      }
      case AVAssetExportSessionStatusCancelled: {
        NSLog(@"[VideoEditor] Trim export cancelled");
        reject(@"export_cancelled", @"Export cancelled", nil);
        break;
      }
      default: {
        NSLog(@"[VideoEditor] Trim unknown export status: %ld", (long)exportSession.status);
        if (exportSession.error) {
          NSLog(@"[VideoEditor] Error: %@", exportSession.error.localizedDescription);
        }
        reject(@"export_unknown", @"Unknown export status", exportSession.error);
        break;
      }
    }
  }];
}

// ✅ Concatenate multiple trimmed clips
RCT_EXPORT_METHOD(concatenateTrimmedClips:(NSArray *)clips
                  outputPath:(NSString *)outputPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSLog(@"[VideoEditor] Concatenating %lu clips", (unsigned long)[clips count]);

  AVMutableComposition *composition = [AVMutableComposition composition];
  CMTime currentTime = kCMTimeZero;

  AVMutableCompositionTrack *compositionVideoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
  AVMutableCompositionTrack *compositionAudioTrack = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];

  for (NSDictionary *clip in clips) {
    NSString *path = clip[@"path"];
    NSNumber *start = clip[@"trimStart"];
    NSNumber *end = clip[@"trimEnd"];

    if (!path || !start || !end) {
      reject(@"invalid_input", @"Missing clip path or trim times", nil);
      return;
    }

    NSURL *clipURL = [NSURL fileURLWithPath:path];
    AVAsset *asset = [AVAsset assetWithURL:clipURL];

    if (!asset) {
      NSString *errMsg = [NSString stringWithFormat:@"Failed to load asset at %@", path];
      NSLog(@"[VideoEditor] %@", errMsg);
      reject(@"asset_load_failed", errMsg, nil);
      return;
    }

    NSLog(@"[VideoEditor] Adding clip: %@", path);

    // Calculate trim range
    CMTime duration = asset.duration;
    CMTime startTime = CMTimeMakeWithSeconds([start doubleValue], duration.timescale);
    CMTime endTime = CMTimeMakeWithSeconds([end doubleValue], duration.timescale);

    if (CMTIME_COMPARE_INLINE(startTime, >=, endTime) || CMTIME_COMPARE_INLINE(endTime, >, duration)) {
      NSString *msg = [NSString stringWithFormat:@"Invalid trim range: start %.2f, end %.2f, duration %.2f",
                       CMTimeGetSeconds(startTime), CMTimeGetSeconds(endTime), CMTimeGetSeconds(duration)];
      NSLog(@"[VideoEditor] %@", msg);
      reject(@"invalid_trim", msg, nil);
      return;
    }

    CMTimeRange timeRange = CMTimeRangeFromTimeToTime(startTime, endTime);

    NSError *videoError = nil;
    AVAssetTrack *videoTrack = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
    if (videoTrack) {
      BOOL success = [compositionVideoTrack insertTimeRange:timeRange
                                                    ofTrack:videoTrack
                                                     atTime:currentTime
                                                      error:&videoError];
      if (!success || videoError) {
        NSLog(@"[VideoEditor] Video insert error: %@", videoError.localizedDescription);
        reject(@"video_insert_failed", @"Failed to insert video", videoError);
        return;
      }
    }

    AVAssetTrack *audioTrack = [[asset tracksWithMediaType:AVMediaTypeAudio] firstObject];
    if (audioTrack) {
      NSError *audioError = nil;
      [compositionAudioTrack insertTimeRange:timeRange
                                     ofTrack:audioTrack
                                      atTime:currentTime
                                       error:&audioError];
      if (audioError) {
        NSLog(@"[VideoEditor] Audio insert error: %@", audioError.localizedDescription);
      }
    }

    CMTime clipDuration = CMTimeSubtract(endTime, startTime);
    currentTime = CMTimeAdd(currentTime, clipDuration);
  }

  NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
  if ([[NSFileManager defaultManager] fileExistsAtPath:[outputURL path]]) {
    [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];
  }

  AVAssetExportSession *exportSession = [[AVAssetExportSession alloc] initWithAsset:composition presetName:AVAssetExportPresetHighestQuality];
  exportSession.outputURL = outputURL;
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;

  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    switch (exportSession.status) {
      case AVAssetExportSessionStatusCompleted: {
        NSLog(@"[VideoEditor] Concatenation completed");
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
        NSLog(@"[VideoEditor] Export failed: %@", exportSession.error.localizedDescription);
        reject(@"concat_export_failed", exportSession.error.localizedDescription, exportSession.error);
        break;
      }
      case AVAssetExportSessionStatusCancelled: {
        NSLog(@"[VideoEditor] Export cancelled");
        reject(@"concat_export_cancelled", @"Export cancelled", nil);
        break;
      }
      default: {
        NSLog(@"[VideoEditor] Unknown export status: %ld", (long)exportSession.status);
        if (exportSession.error) {
          NSLog(@"[VideoEditor] Error: %@", exportSession.error.localizedDescription);
        }
        reject(@"concat_export_unknown", @"Unknown export status", exportSession.error);
        break;
      }
    }
  }];
}

@end
