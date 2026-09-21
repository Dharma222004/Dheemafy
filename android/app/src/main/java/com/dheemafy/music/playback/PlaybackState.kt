package com.dheemafy.music.playback

import androidx.media3.common.Player
import com.dheemafy.music.data.model.Song

data class PlaybackState(
    val currentSong: Song? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val currentPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val repeatMode: Int = Player.REPEAT_MODE_ALL,
    val isShuffleEnabled: Boolean = false,
    val queue: List<Song> = emptyList(),
    val queueTitle: String = "All Songs",
    val currentIndex: Int = -1,
    val errorMessage: String? = null
) {
    val progressFraction: Float
        get() = if (durationMs > 0L) {
            (currentPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
        } else 0f
}
