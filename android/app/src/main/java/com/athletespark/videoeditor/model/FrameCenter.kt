package com.athletespark.videoeditor.model

data class FrameCenter(
    val timeMs: Long,
    val centerX: Float,
    val centerY: Float,
    val zoom: Float = 1.0f
)
