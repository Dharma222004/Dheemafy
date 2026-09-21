package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dheemafy.music.data.model.ArtistDetail
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.SongRow
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun ArtistDetailScreen(
    artistId: String,
    artistName: String,
    repository: MusicRepository,
    playbackManager: PlaybackManager,
    playbackState: PlaybackState,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    var artistDetail by remember { mutableStateOf<ArtistDetail?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    fun loadArtist() {
        scope.launch {
            isLoading = true
            error = null
            repository.getArtist(artistId).fold(
                onSuccess = { detail ->
                    val sortedSongs = detail.songs.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title.trim() })
                    artistDetail = detail.copy(songs = sortedSongs, songCount = sortedSongs.size)
                    isLoading = false
                },
                onFailure = { err ->
                    // Fallback to song search by artist name
                    repository.getSongs(artist = artistName, limit = 100).fold(
                        onSuccess = { songs ->
                            val sortedSongs = songs.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title.trim() })
                            artistDetail = ArtistDetail(
                                id = artistId,
                                name = artistName,
                                songCount = sortedSongs.size,
                                songs = sortedSongs
                            )
                            isLoading = false
                        },
                        onFailure = {
                            error = err.message ?: "Failed to load artist details"
                            isLoading = false
                        }
                    )
                }
            )
        }
    }

    LaunchedEffect(artistId) {
        loadArtist()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SpotifyBlack)
    ) {
        if (isLoading && artistDetail == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SpotifyGreen)
            }
        } else if (error != null && artistDetail == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(text = error ?: "Failed to load artist", color = SpotifyGrayText)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = { loadArtist() },
                    colors = ButtonDefaults.buttonColors(containerColor = SpotifyGreen, contentColor = SpotifyBlack)
                ) {
                    Text("Retry")
                }
            }
        } else {
            val detail = artistDetail ?: return@Box
            val songs = detail.songs

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 120.dp)
            ) {
                // Header with large artist avatar
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            IconButton(onClick = onBackClick) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Back",
                                    tint = SpotifyWhite
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Box(
                            modifier = Modifier
                                .size(160.dp)
                                .clip(CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!detail.largeImageUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = detail.largeImageUrl,
                                    contentDescription = detail.name,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(SpotifyElevated),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Person,
                                        contentDescription = null,
                                        tint = SpotifyGrayText,
                                        modifier = Modifier.size(64.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            text = detail.name,
                            color = SpotifyWhite,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Text(
                            text = "${songs.size} songs",
                            color = SpotifyGrayText,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        val isPlayingThisArtist = playbackState.queueTitle == detail.name && playbackState.isPlaying

                        Button(
                            onClick = {
                                if (songs.isNotEmpty()) {
                                    if (playbackState.queueTitle == detail.name) {
                                        playbackManager.playPause()
                                    } else {
                                        playbackManager.playQueue(songs, 0, detail.name)
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = SpotifyGreen,
                                contentColor = SpotifyBlack
                            ),
                            shape = CircleShape,
                            modifier = Modifier.padding(horizontal = 24.dp)
                        ) {
                            Icon(
                                imageVector = if (isPlayingThisArtist) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isPlayingThisArtist) "PAUSE" else "PLAY ALL",
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Songs header
                item {
                    Text(
                        text = "Songs",
                        color = SpotifyWhite,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }

                itemsIndexed(songs) { index, song ->
                    val isCurrent = playbackState.currentSong?.id == song.id
                    SongRow(
                        song = song,
                        isCurrentSong = isCurrent,
                        isPlaying = isCurrent && playbackState.isPlaying,
                        index = index,
                        onSongClick = {
                            playbackManager.playQueue(songs, index, detail.name)
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
