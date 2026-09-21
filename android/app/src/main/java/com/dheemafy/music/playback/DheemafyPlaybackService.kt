package com.dheemafy.music.playback

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.dheemafy.music.MainActivity
import com.dheemafy.music.R

@UnstableApi
class DheemafyPlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private lateinit var player: ExoPlayer

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        // Configure audio attributes for music playback with automatic audio-focus handling
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()

        // Optimized load control for smooth online streaming and fast track switching
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 15_000,
                /* maxBufferMs = */ 50_000,
                /* bufferForPlaybackMs = */ 1_500,
                /* bufferForPlaybackAfterRebufferMs = */ 3_000
            )
            .build()

        player = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setLoadControl(loadControl)
            .build().apply {
                repeatMode = Player.REPEAT_MODE_ALL
                playWhenReady = true
            }

        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                val currentMedia = player.currentMediaItem
                Log.e(
                    TAG,
                    "Playback error [code=${error.errorCode}, name=${error.errorCodeName}] on item: ${currentMedia?.mediaId}, url=${currentMedia?.requestMetadata?.mediaUri}",
                    error
                )
                // If a single track fails (e.g. 404 or corrupted cloud url), advance to next track to preserve continuous playback
                if (player.hasNextMediaItem()) {
                    Log.w(TAG, "Attempting to skip to next item in queue after error...")
                    player.seekToNextMediaItem()
                    player.prepare()
                    player.play()
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                Log.d(TAG, "MediaItem transition: ${mediaItem?.mediaMetadata?.title} (reason=$reason)")
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_READY -> Log.d(TAG, "Player STATE_READY. Duration: ${player.duration}ms")
                    Player.STATE_BUFFERING -> Log.d(TAG, "Player STATE_BUFFERING...")
                    Player.STATE_ENDED -> Log.d(TAG, "Player STATE_ENDED")
                    Player.STATE_IDLE -> Log.d(TAG, "Player STATE_IDLE")
                }
            }
        })

        val activityIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            activityIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        mediaSession = MediaSession.Builder(this, player)
            .setSessionActivity(pendingIntent)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.app_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Dheemafy Background Playback Controls"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val TAG = "DheemafyPlaybackSvc"
        const val CHANNEL_ID = "dheemafy_playback_channel"
    }
}
