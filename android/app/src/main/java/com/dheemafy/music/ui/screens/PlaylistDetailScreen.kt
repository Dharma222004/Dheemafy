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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.data.local.UserPlaylistManager
import com.dheemafy.music.data.model.PlaylistDetail
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.AddSongsToPlaylistDialog
import com.dheemafy.music.ui.components.AddToPlaylistDialog
import com.dheemafy.music.ui.components.PlaylistFallbackCard
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
    userPlaylistManager: UserPlaylistManager,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val isUserPlaylist = playlistId.startsWith("upl_")

    var playlistDetail by remember { mutableStateOf<PlaylistDetail?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    var showAddSongsDialog by remember { mutableStateOf(false) }
    var songToAddToPlaylist by remember { mutableStateOf<Song?>(null) }
    var showDeleteConfirmDialog by remember { mutableStateOf(false) }

    val userPlaylists by userPlaylistManager.playlists.collectAsState()
    val currentUserPlaylist = remember(userPlaylists, playlistId) {
        if (isUserPlaylist) userPlaylists.find { it.id == playlistId } else null
    }

    // Cache of catalog songs for user playlist resolution
    var allCatalogSongs by remember { mutableStateOf<List<Song>>(emptyList()) }

    fun loadPlaylist() {
        scope.launch {
            isLoading = true
            error = null

            if (isUserPlaylist) {
                // Fetch catalog songs if not already loaded
                if (allCatalogSongs.isEmpty()) {
                    repository.getSongs(limit = 1000).fold(
                        onSuccess = { songs ->
                            allCatalogSongs = songs
                            val songMap = songs.associateBy { it.id }
                            val pl = currentUserPlaylist ?: userPlaylistManager.getById(playlistId)
                            val tracks = pl?.songIds?.mapNotNull { songMap[it] } ?: emptyList()
                            playlistDetail = PlaylistDetail(
                                id = playlistId,
                                name = pl?.name ?: playlistName,
                                comment = "Custom User Playlist",
                                songCount = tracks.size,
                                tracks = tracks
                            )
                            isLoading = false
                        },
                        onFailure = { err ->
                            error = err.message ?: "Failed to load library catalog"
                            isLoading = false
                        }
                    )
                } else {
                    val songMap = allCatalogSongs.associateBy { it.id }
                    val pl = currentUserPlaylist ?: userPlaylistManager.getById(playlistId)
                    val tracks = pl?.songIds?.mapNotNull { songMap[it] } ?: emptyList()
                    playlistDetail = PlaylistDetail(
                        id = playlistId,
                        name = pl?.name ?: playlistName,
                        comment = "Custom User Playlist",
                        songCount = tracks.size,
                        tracks = tracks
                    )
                    isLoading = false
                }
            } else if (playlistId.equals("all-songs", ignoreCase = true) || playlistName.equals("All Songs", ignoreCase = true)) {
                repository.getSongs(folder = null, limit = 1000).fold(
                    onSuccess = { songs ->
                        val sortedSongs = songs.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title.trim() })
                        playlistDetail = PlaylistDetail(
                            id = "all-songs",
                            name = "All Songs",
                            comment = "Complete music library catalog",
                            songCount = sortedSongs.size,
                            tracks = sortedSongs
                        )
                        isLoading = false
                    },
                    onFailure = { err ->
                        error = err.message ?: "Failed to load songs"
                        isLoading = false
                    }
                )
            } else {
                repository.getPlaylist(playlistId).fold(
                    onSuccess = { detail ->
                        val sortedTracks = detail.tracks.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title.trim() })
                        playlistDetail = detail.copy(tracks = sortedTracks, songCount = sortedTracks.size)
                        isLoading = false
                    },
                    onFailure = { err ->
                        // Fallback to folder query
                        repository.getSongs(folder = playlistName, limit = 1000).fold(
                            onSuccess = { folderSongs ->
                                val sorted = folderSongs.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title.trim() })
                                playlistDetail = PlaylistDetail(
                                    id = playlistId,
                                    name = playlistName,
                                    comment = "Curated playlist",
                                    songCount = sorted.size,
                                    tracks = sorted
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
    }

    LaunchedEffect(playlistId) {
        loadPlaylist()
    }

    // Reactive update for user playlist modifications
    LaunchedEffect(currentUserPlaylist?.songIds, allCatalogSongs) {
        if (isUserPlaylist && allCatalogSongs.isNotEmpty() && currentUserPlaylist != null) {
            val songMap = allCatalogSongs.associateBy { it.id }
            val tracks = currentUserPlaylist.songIds.mapNotNull { songMap[it] }
            playlistDetail = PlaylistDetail(
                id = playlistId,
                name = currentUserPlaylist.name,
                comment = "Custom User Playlist",
                songCount = tracks.size,
                tracks = tracks
            )
        }
    }

    val headerGradientColors = remember(playlistName, isUserPlaylist) {
        when {
            isUserPlaylist -> listOf(Color(0xFF0F5132), Color(0xFF132A13), SpotifyBlack)
            playlistName.contains("sharu", ignoreCase = true) -> listOf(Color(0xFF581C87), SpotifyBlack)
            playlistName.contains("hills", ignoreCase = true) -> listOf(Color(0xFF065F46), SpotifyBlack)
            playlistName.contains("all", ignoreCase = true) -> listOf(Color(0xFF1E3A8A), SpotifyBlack)
            else -> listOf(Color(0xFF2E4B37), SpotifyBlack)
        }
    }

    if (showAddSongsDialog) {
        AddSongsToPlaylistDialog(
            playlistId = playlistId,
            playlistName = playlistDetail?.name ?: playlistName,
            userPlaylistManager = userPlaylistManager,
            repository = repository,
            onDismiss = { showAddSongsDialog = false }
        )
    }

    if (songToAddToPlaylist != null) {
        AddToPlaylistDialog(
            song = songToAddToPlaylist!!,
            userPlaylistManager = userPlaylistManager,
            onDismiss = { songToAddToPlaylist = null }
        )
    }

    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            containerColor = SpotifyCard,
            shape = RoundedCornerShape(16.dp),
            title = {
                Text("Delete playlist", color = SpotifyWhite, fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    "Are you sure you want to delete \"${playlistDetail?.name ?: playlistName}\"? This action cannot be undone.",
                    color = SpotifyGrayText
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        userPlaylistManager.deletePlaylist(playlistId)
                        showDeleteConfirmDialog = false
                        onBackClick()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SpotifyError, contentColor = SpotifyWhite)
                ) {
                    Text("Delete", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = false }) {
                    Text("Cancel", color = SpotifyGrayText)
                }
            }
        )
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
                            .background(Brush.verticalGradient(colors = headerGradientColors))
                            .padding(16.dp)
                    ) {
                        Column {
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

                                Spacer(modifier = Modifier.weight(1f))

                                if (isUserPlaylist) {
                                    IconButton(onClick = { showDeleteConfirmDialog = true }) {
                                        Icon(
                                            imageVector = Icons.Default.DeleteOutline,
                                            contentDescription = "Delete Playlist",
                                            tint = SpotifyGrayText
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(110.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                ) {
                                    PlaylistFallbackCard(name = detail.name)
                                }

                                Spacer(modifier = Modifier.width(16.dp))

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = if (isUserPlaylist) "YOUR PLAYLIST" else "PLAYLIST",
                                        color = SpotifyGreenBright,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 1.sp
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = detail.name,
                                        color = SpotifyWhite,
                                        fontSize = 22.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 2
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    val trackCount = tracks.size
                                    Text(
                                        text = "$trackCount ${if (trackCount == 1) "song" else "songs"}${if (!isUserPlaylist) " • Alphabetical" else ""}",
                                        color = SpotifyGrayText,
                                        fontSize = 13.sp
                                    )
                                }
                            }
                        }
                    }
                }

                // Control Bar: Big Green Play button & Shuffle & (+ Add Songs for user playlists)
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

                        if (isUserPlaylist) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Button(
                                onClick = { showAddSongsDialog = true },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = SpotifyDarkSurface,
                                    contentColor = SpotifyWhite
                                ),
                                shape = RoundedCornerShape(20.dp),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = SpotifyGreen
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Add Songs", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
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
                                } else if (isUserPlaylist) {
                                    showAddSongsDialog = true
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

                // If user playlist is empty, show helpful empty state with Add Songs prompt
                if (tracks.isEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 40.dp, horizontal = 24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "This playlist is empty",
                                color = SpotifyWhite,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Search and add your favorite tracks to start listening.",
                                color = SpotifyGrayText,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(20.dp))
                            Button(
                                onClick = { showAddSongsDialog = true },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = SpotifyGreen,
                                    contentColor = SpotifyBlack
                                ),
                                shape = RoundedCornerShape(24.dp),
                                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Add to this playlist", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            }
                        }
                    }
                }

                // Track List (Isolated Queue Playback: plays only this playlist!)
                itemsIndexed(tracks, key = { _, song -> song.id }) { index, song ->
                    val isCurrent = playbackState.currentSong?.id == song.id
                    SongRow(
                        song = song,
                        isCurrentSong = isCurrent,
                        isPlaying = isCurrent && playbackState.isPlaying,
                        index = index,
                        onSongClick = {
                            playbackManager.playQueue(tracks, index, detail.name)
                        },
                        onLikeClick = {
                            scope.launch {
                                repository.toggleLike(song.id, song.isLiked)
                            }
                        },
                        onAddToPlaylistClick = {
                            songToAddToPlaylist = song
                        },
                        onRemoveClick = if (isUserPlaylist) {
                            {
                                userPlaylistManager.removeSongFromPlaylist(playlistId, song.id)
                            }
                        } else null
                    )
                }
            }
        }
    }
}
