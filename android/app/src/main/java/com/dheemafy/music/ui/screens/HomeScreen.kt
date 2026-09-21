package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.data.local.SessionManager
import com.dheemafy.music.data.model.HomeData
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.ArtistItemCard
import com.dheemafy.music.ui.components.PlaylistItemCard
import com.dheemafy.music.ui.components.SongRow
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Calendar

@Composable
fun HomeScreen(
    repository: MusicRepository,
    sessionManager: SessionManager,
    playbackManager: PlaybackManager,
    playbackState: PlaybackState,
    onPlaylistClick: (String, String) -> Unit,
    onArtistClick: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    var homeData by remember { mutableStateOf<HomeData?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    val user = sessionManager.currentUser.collectAsState().value
    val greeting = remember {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        when (hour) {
            in 4..11 -> "Good morning"
            in 12..16 -> "Good afternoon"
            else -> "Good evening"
        }
    }

    fun loadData() {
        scope.launch {
            isLoading = true
            error = null
            repository.getHome().fold(
                onSuccess = { data ->
                    homeData = data
                    isLoading = false
                },
                onFailure = { err ->
                    error = err.message ?: "Failed to load home music feed"
                    isLoading = false
                }
            )
        }
    }

    LaunchedEffect(Unit) {
        loadData()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SpotifyBlack)
    ) {
        if (isLoading && homeData == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SpotifyGreen)
            }
        } else if (error != null && homeData == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(text = error ?: "Error loading home", color = SpotifyGrayText, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = { loadData() },
                    colors = ButtonDefaults.buttonColors(containerColor = SpotifyGreen, contentColor = SpotifyBlack)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Retry")
                }
            }
        } else {
            val data = homeData ?: HomeData()

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 120.dp)
            ) {
                // Header Greeting
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 16.dp)
                    ) {
                        Text(
                            text = "$greeting, ${user?.name ?: "Sharu"}",
                            color = SpotifyWhite,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Featured Playlists Shelf
                if (data.featuredPlaylists.isNotEmpty()) {
                    item {
                        Text(
                            text = "Featured Playlists",
                            color = SpotifyWhite,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 12.dp)
                        ) {
                            items(data.featuredPlaylists) { playlist ->
                                PlaylistItemCard(
                                    playlist = playlist,
                                    onClick = { onPlaylistClick(playlist.id, playlist.name) }
                                )
                            }
                        }
                    }
                }

                // Quick Picks / Recently Played
                if (data.quickPicks.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Quick picks",
                            color = SpotifyWhite,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                    items(data.quickPicks) { song ->
                        val isCurrent = playbackState.currentSong?.id == song.id
                        SongRow(
                            song = song,
                            isCurrentSong = isCurrent,
                            isPlaying = isCurrent && playbackState.isPlaying,
                            onSongClick = {
                                val idx = data.quickPicks.indexOf(song)
                                playbackManager.playQueue(data.quickPicks, idx, "Quick Picks")
                            },
                            onLikeClick = {
                                scope.launch {
                                    repository.toggleLike(song.id, song.isLiked)
                                }
                            }
                        )
                    }
                }

                // Popular Artists
                if (data.popularArtists.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Popular Artists",
                            color = SpotifyWhite,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 12.dp)
                        ) {
                            items(data.popularArtists) { artist ->
                                ArtistItemCard(
                                    artist = artist,
                                    onClick = { onArtistClick(artist.id, artist.name) }
                                )
                            }
                        }
                    }
                }

                // Trending Songs
                if (data.trending.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Trending Now",
                            color = SpotifyWhite,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                    items(data.trending) { song ->
                        val isCurrent = playbackState.currentSong?.id == song.id
                        SongRow(
                            song = song,
                            isCurrentSong = isCurrent,
                            isPlaying = isCurrent && playbackState.isPlaying,
                            onSongClick = {
                                val idx = data.trending.indexOf(song)
                                playbackManager.playQueue(data.trending, idx, "Trending")
                            },
                            onLikeClick = {
                                scope.launch {
                                    repository.toggleLike(song.id, song.isLiked)
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}
