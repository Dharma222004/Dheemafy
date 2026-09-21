package com.dheemafy.music

import android.app.Application
import androidx.media3.common.util.UnstableApi
import com.dheemafy.music.data.api.ApiClient
import com.dheemafy.music.data.local.SessionManager
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager

import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder

@UnstableApi
class DheemafyApplication : Application(), ImageLoaderFactory {

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .components {
                add(SvgDecoder.Factory())
            }
            .crossfade(true)
            .build()
    }

    lateinit var sessionManager: SessionManager
        private set

    lateinit var apiClient: ApiClient
        private set

    lateinit var repository: MusicRepository
        private set

    lateinit var playbackManager: PlaybackManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        sessionManager = SessionManager(this)
        apiClient = ApiClient(sessionManager)
        repository = MusicRepository(apiClient, sessionManager)
        playbackManager = PlaybackManager(this)
    }

    override fun onTerminate() {
        playbackManager.release()
        super.onTerminate()
    }

    companion object {
        lateinit var instance: DheemafyApplication
            private set
    }
}
