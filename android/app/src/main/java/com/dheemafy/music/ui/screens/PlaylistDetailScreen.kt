package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dheemafy.music.data.model.PlaylistDetail
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.SongRow
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun PlaylistDetailScreen(
    playlistId: String,
    playlistName: String,
    repository: MusicRepository,
    playbackManager: PlaybackManager,
    playbackState: PlaybackState,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    var playlistDetail by remember { mutableStateOf<PlaylistDetail?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    fun loadPlaylist() {
        scope.launch {
            isLoading = true
            error = null
            // Check if it's "All Songs" folder or standard playlist ID
            val result = if (playlistId.equals("all-songs", ignoreCase = true) || playlistName.equals("All Songs", ignoreCase = true)) {
                repository.getSongs(folder = null, limit = 500).map { songs ->
                    PlaylistDetail(
                        id = "all-songs",
                        name = "All Songs",
                        comment = "Complete music library catalog",
                        songCount = songs.size,
                        tracks = songs
                    )
                }
            } else {
                repository.getPlaylist(playlistId)
            }

            result.fold(
                onSuccess = { detail ->
                    playlistDetail = detail
                    isLoading = false
                },
                onFailure = { err ->
                    // Fallback to songs route with folder param if playlist lookup fails
                    repository.getSongs(folder = playlistName, limit = 500).fold(
                        onSuccess = { folderSongs ->
                            playlistDetail = PlaylistDetail(
                                id = playlistId,
                                name = playlistName,
                                comment = "Curated playlist",
                                songCount = folderSongs.size,
                                tracks = folderSongs
                            )
                            isLoading = false
                        },
                        onFailure = {
                            error = err.message ?: "Failed to load playlist"
                            isLoading = false
                        }
                    )
                }
            )
        }
    }

    LaunchedEffect(playlistId) {
        loadPlaylist()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SpotifyBlack)
    ) {
        if (isLoading && playlistDetail == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SpotifyGreen)
            }
        } else if (error != null && playlistDetail == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(text = error ?: "Failed to load playlist", color = SpotifyGrayText)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = { loadPlaylist() },
                    colors = ButtonDefaults.buttonColors(containerColor = SpotifyGreen, contentColor = SpotifyBlack)
                ) {
                    Text("Retry")
                }
            }
        } else {
            val detail = playlistDetail ?: return@Box
            val tracks = detail.tracks

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 120.dp)
            ) {
                // Header Banner
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(280.dp)
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color(0xFF2E4B37),
                                        SpotifyBlack
                                    )
                                )
                            )
                            .padding(16.dp)
                    ) {
                        IconButton(
                            onClick = onBackClick,
                            modifier = Modifier.align(Alignment.TopStart)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = SpotifyWhite
                            )
                        }

                        Column(
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .padding(bottom = 8.dp)
                        ) {
                            Text(
                                text = "PLAYLIST",
                                color = SpotifyGrayText,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = detail.name,
                                color = SpotifyWhite,
                                fontSize = 28.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            val trackCount = detail.songCount ?: tracks.size
                            Text(
                                text = "$trackCount songs • Isolated Queue",
                                color = SpotifyGrayText,
                                fontSize = 13.sp
                            )
                        }
                    }
                }

                // Control Bar: Big Green Play button & Shuffle
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = {
                                if (tracks.isNotEmpty()) {
                                    playbackManager.toggleShuffle()
                                    playbackManager.playQueue(tracks, 0, detail.name)
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Shuffle,
                                contentDescription = "Shuffle",
                                tint = if (playbackState.isShuffleEnabled) SpotifyGreen else SpotifyGrayText,
                                modifier = Modifier.size(26.dp)
                            )
                        }

                        Spacer(modifier = Modifier.weight(1f))

                        val isPlayingThisPlaylist = playbackState.queueTitle == detail.name && playbackState.isPlaying

                        FloatingActionButton(
                            onClick = {
                                if (tracks.isNotEmpty()) {
                                    if (playbackState.queueTitle == detail.name) {
                                        playbackManager.playPause()
                                    } else {
                                        playbackManager.playQueue(tracks, 0, detail.name)
                                    }
                                }
                            },
                            containerColor = SpotifyGreen,
                            contentColor = SpotifyBlack,
                            shape = CircleShape,
                            modifier = Modifier.size(56.dp)
                        ) {
                            Icon(
                                imageVector = if (isPlayingThisPlaylist) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = "Play/Pause Playlist",
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                }

                // Track List
                itemsIndexed(tracks) { index, song ->
                    val isCurrent = playbackState.currentSong?.id == song.id
                    SongRow(
                        song = song,
                        isCurrentSong = isCurrent,
                        isPlaying = isCurrent && playbackState.isPlaying,
                        index = index,
                        onSongClick = {
                            // Isolated Queue Playback: Starts playing from this playlist!
                            playbackManager.playQueue(tracks, index, detail.name)
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
