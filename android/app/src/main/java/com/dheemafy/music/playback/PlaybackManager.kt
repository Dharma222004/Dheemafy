package com.dheemafy.music.playback

import android.content.ComponentName
import android.content.Context
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.dheemafy.music.data.model.Song
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

@UnstableApi
class PlaybackManager(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val _playbackState = MutableStateFlow(PlaybackState())
    val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private var positionJob: Job? = null

    private var currentSongList: List<Song> = emptyList()
    private var currentQueueTitle: String = "All Songs"

    init {
        initializeController()
    }

    private fun initializeController() {
        val sessionToken = SessionToken(
            context,
            ComponentName(context, DheemafyPlaybackService::class.java)
        )
        controllerFuture = MediaController.Builder(context, sessionToken).buildAsync().apply {
            addListener({
                try {
                    val ctrl = get()
                    controller = ctrl
                    setupPlayerListener(ctrl)
                    syncWithPlayer(ctrl)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to connect to MediaSessionService", e)
                }
            }, MoreExecutors.directExecutor())
        }
    }

    private fun setupPlayerListener(ctrl: MediaController) {
        ctrl.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                syncWithPlayer(ctrl)
                if (isPlaying) {
                    startPositionTicker()
                } else {
                    stopPositionTicker()
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                syncWithPlayer(ctrl)
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                syncWithPlayer(ctrl)
            }

            override fun onRepeatModeChanged(repeatMode: Int) {
                _playbackState.update { it.copy(repeatMode = repeatMode) }
            }

            override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) {
                _playbackState.update { it.copy(isShuffleEnabled = shuffleModeEnabled) }
            }

            override fun onTimelineChanged(timeline: Timeline, reason: Int) {
                syncWithPlayer(ctrl)
            }
        })
    }

    private fun syncWithPlayer(ctrl: MediaController) {
        val currentItem = ctrl.currentMediaItem
        val currentSong = currentItem?.let { MediaItemConverter.toSong(it) }
            ?: currentSongList.getOrNull(ctrl.currentMediaItemIndex)

        val duration = ctrl.duration.takeIf { it > 0 } ?: currentSong?.duration ?: 0L
        val position = ctrl.currentPosition.coerceAtLeast(0L)
        val isBuffering = ctrl.playbackState == Player.STATE_BUFFERING
        val isPlaying = ctrl.isPlaying

        _playbackState.update { current ->
            current.copy(
                currentSong = currentSong,
                isPlaying = isPlaying,
                isBuffering = isBuffering,
                currentPositionMs = position,
                durationMs = duration,
                repeatMode = ctrl.repeatMode,
                isShuffleEnabled = ctrl.shuffleModeEnabled,
                queue = currentSongList,
                queueTitle = currentQueueTitle,
                currentIndex = ctrl.currentMediaItemIndex
            )
        }
    }

    private fun startPositionTicker() {
        stopPositionTicker()
        positionJob = scope.launch {
            while (isActive) {
                controller?.let { ctrl ->
                    if (ctrl.isPlaying) {
                        val pos = ctrl.currentPosition.coerceAtLeast(0L)
                        val dur = ctrl.duration.takeIf { it > 0 }
                            ?: _playbackState.value.currentSong?.duration ?: 0L

                        _playbackState.update {
                            it.copy(currentPositionMs = pos, durationMs = dur)
                        }
                    }
                }
                delay(300)
            }
        }
    }

    private fun stopPositionTicker() {
        positionJob?.cancel()
        positionJob = null
    }

    fun playQueue(songs: List<Song>, startIndex: Int = 0, queueTitle: String = "Playlist") {
        if (songs.isEmpty()) return

        currentSongList = songs
        currentQueueTitle = queueTitle

        val ctrl = controller ?: run {
            Log.w(TAG, "Controller not ready yet, queue saved for playback upon connection")
            return
        }

        val mediaItems = MediaItemConverter.toMediaItems(songs)
        val safeIndex = startIndex.coerceIn(0, songs.lastIndex)

        ctrl.setMediaItems(mediaItems, safeIndex, 0L)
        ctrl.prepare()
        ctrl.play()
        syncWithPlayer(ctrl)
    }

    fun playPause() {
        val ctrl = controller ?: return
        if (ctrl.isPlaying) {
            ctrl.pause()
        } else {
            if (ctrl.playbackState == Player.STATE_IDLE) {
                ctrl.prepare()
            }
            ctrl.play()
        }
    }

    fun seekTo(positionMs: Long) {
        val ctrl = controller ?: return
        ctrl.seekTo(positionMs)
        _playbackState.update { it.copy(currentPositionMs = positionMs) }
    }

    fun skipToNext() {
        val ctrl = controller ?: return
        if (ctrl.hasNextMediaItem()) {
            ctrl.seekToNextMediaItem()
        } else if (ctrl.repeatMode == Player.REPEAT_MODE_ALL && ctrl.mediaItemCount > 0) {
            // Wrap to first track on Repeat All
            ctrl.seekToDefaultPosition(0)
        }
    }

    fun skipToPrevious() {
        val ctrl = controller ?: return
        val currentPos = ctrl.currentPosition
        // If current playback position > approximately 3 seconds: restart current song. Otherwise: previous song.
        if (currentPos > 3000L) {
            ctrl.seekTo(0L)
        } else {
            if (ctrl.hasPreviousMediaItem()) {
                ctrl.seekToPreviousMediaItem()
            } else if (ctrl.repeatMode == Player.REPEAT_MODE_ALL && ctrl.mediaItemCount > 0) {
                // Wrap to last track on Repeat All
                ctrl.seekToDefaultPosition(ctrl.mediaItemCount - 1)
            } else {
                ctrl.seekTo(0L)
            }
        }
    }

    fun toggleRepeat() {
        val ctrl = controller ?: return
        val nextMode = when (ctrl.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            Player.REPEAT_MODE_ONE -> Player.REPEAT_MODE_OFF
            else -> Player.REPEAT_MODE_ALL
        }
        ctrl.repeatMode = nextMode
    }

    fun toggleShuffle() {
        val ctrl = controller ?: return
        ctrl.shuffleModeEnabled = !ctrl.shuffleModeEnabled
    }

    fun release() {
        stopPositionTicker()
        scope.cancel()
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
    }

    companion object {
        private const val TAG = "PlaybackManager"
    }
}
