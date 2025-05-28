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

@end
