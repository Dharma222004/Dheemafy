package com.dheemafy.music

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.media3.common.util.UnstableApi
import com.dheemafy.music.ui.DheemafyApp
import com.dheemafy.music.ui.screens.LoginScreen
import com.dheemafy.music.ui.theme.DheemafyTheme
import com.dheemafy.music.ui.theme.SpotifyBlack

@UnstableApi
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as DheemafyApplication
        val sessionManager = app.sessionManager
        val repository = app.repository
        val playbackManager = app.playbackManager

        setContent {
            DheemafyTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = SpotifyBlack
                ) {
                    val isLoggedIn by sessionManager.isLoggedIn.collectAsState()

                    if (isLoggedIn) {
                        DheemafyApp(
                            repository = repository,
                            sessionManager = sessionManager,
                            playbackManager = playbackManager
                        )
                    } else {
                        LoginScreen(
                            repository = repository,
                            sessionManager = sessionManager,
                            onLoginSuccess = { /* Automatically flips via isLoggedIn StateFlow */ }
                        )
                    }
                }
            }
        }
    }
}
