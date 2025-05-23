#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <AVFoundation/AVFoundation.h>

@interface VideoEditorModule : NSObject <RCTBridgeModule>
@end

@implementation VideoEditorModule

RCT_EXPORT_MODULE(VideoEditorModule);

RCT_EXPORT_METHOD(trimVideo:(NSString *)inputPath
                  startTime:(nonnull NSNumber *)start
                  endTime:(nonnull NSNumber *)end
                  outputPath:(NSString *)outputPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *inputURL = [NSURL fileURLWithPath:inputPath];
  NSURL *outputURL = [NSURL fileURLWithPath:outputPath];

  NSLog(@"[VideoEditor] Input path: %@", inputURL);
  NSLog(@"[VideoEditor] Output path: %@", outputURL);

  // Check if the output directory exists
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

  // Remove existing file if it exists
  if ([[NSFileManager defaultManager] fileExistsAtPath:[outputURL path]]) {
    NSError *removeError = nil;
    [[NSFileManager defaultManager] removeItemAtURL:outputURL error:&removeError];
    if (removeError) {
      reject(@"file_remove_error", @"Could not remove existing file at output path", removeError);
      return;
    }
  }

  AVAsset *asset = [AVAsset assetWithURL:inputURL];
  AVAssetExportSession *exportSession = [[AVAssetExportSession alloc]
                                         initWithAsset:asset
                                         presetName:AVAssetExportPresetHighestQuality];

  if (!exportSession) {
    reject(@"export_error", @"Could not create AVAssetExportSession", nil);
    return;
  }

  exportSession.outputURL = outputURL;
  exportSession.outputFileType = AVFileTypeQuickTimeMovie; // Works reliably with .mov files

  CMTime startTimeCM = CMTimeMakeWithSeconds([start doubleValue], asset.duration.timescale);
  CMTime endTimeCM = CMTimeMakeWithSeconds([end doubleValue], asset.duration.timescale);
  CMTimeRange range = CMTimeRangeFromTimeToTime(startTimeCM, endTimeCM);
  exportSession.timeRange = range;

  NSLog(@"[VideoEditor] Trimming from %.2f to %.2f seconds", [start doubleValue], [end doubleValue]);

  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    switch (exportSession.status) {
      case AVAssetExportSessionStatusCompleted:
        NSLog(@"[VideoEditor] Export completed: %@", outputPath);
        resolve(outputPath);
        break;
      case AVAssetExportSessionStatusFailed:
        NSLog(@"[VideoEditor] Export failed: %@", exportSession.error.localizedDescription);
        reject(@"export_failed", exportSession.error.localizedDescription, exportSession.error);
        break;
      case AVAssetExportSessionStatusCancelled:
        NSLog(@"[VideoEditor] Export cancelled");
        reject(@"export_cancelled", @"Export cancelled", nil);
        break;
      default:
        NSLog(@"[VideoEditor] Export unknown error");
        reject(@"export_unknown", @"Unknown export status", nil);
        break;
    }
  }];
}

@end
