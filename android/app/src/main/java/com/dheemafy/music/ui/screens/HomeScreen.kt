package com.dheemafy.music.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.R
import com.dheemafy.music.data.local.SessionManager
import com.dheemafy.music.data.local.UserPlaylist
import com.dheemafy.music.data.local.UserPlaylistManager
import com.dheemafy.music.data.model.HomeData
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.AddToPlaylistDialog
import com.dheemafy.music.ui.components.ArtistItemCard
import com.dheemafy.music.ui.components.CreatePlaylistDialog
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
    userPlaylistManager: UserPlaylistManager,
    onPlaylistClick: (String, String) -> Unit,
    onArtistClick: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    var homeData by remember { mutableStateOf<HomeData?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showProfileDialog by remember { mutableStateOf(false) }
    var showCreatePlaylistDialog by remember { mutableStateOf(false) }
    var songToAddToPlaylist by remember { mutableStateOf<Song?>(null) }

    val user = sessionManager.currentUser.collectAsState().value
    val userPlaylists by userPlaylistManager.playlists.collectAsState()
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

    // Create Playlist Dialog
    if (showCreatePlaylistDialog) {
        CreatePlaylistDialog(
            onDismiss = { showCreatePlaylistDialog = false },
            onConfirm = { name ->
                showCreatePlaylistDialog = false
                val newPl = userPlaylistManager.createPlaylist(name)
                // Open newly created playlist immediately so user can add songs
                onPlaylistClick(newPl.id, newPl.name)
            }
        )
    }

    // Add To Playlist Dialog
    if (songToAddToPlaylist != null) {
        AddToPlaylistDialog(
            song = songToAddToPlaylist!!,
            userPlaylistManager = userPlaylistManager,
            onDismiss = { songToAddToPlaylist = null }
        )
    }

    // Profile & Logout Dialog
    if (showProfileDialog) {
        AlertDialog(
            onDismissRequest = { showProfileDialog = false },
            containerColor = SpotifyCard,
            shape = RoundedCornerShape(16.dp),
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(SpotifyGreen),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = (user?.name ?: user?.userName ?: "U").take(1).uppercase(),
                            color = SpotifyBlack,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = user?.name ?: "User",
                            color = SpotifyWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "@${user?.userName ?: "user"}",
                            color = SpotifyGrayText,
                            fontSize = 13.sp
                        )
                    }
                }
            },
            text = {
                Text(
                    text = "Are you sure you want to log out of Dheemafy?",
                    color = SpotifyGrayText,
                    fontSize = 14.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showProfileDialog = false
                        repository.logout()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = SpotifyError,
                        contentColor = SpotifyWhite
                    ),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Log Out",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Log out", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showProfileDialog = false }) {
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
                // Top Brand Bar + User Avatar
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.dheemafy_logo),
                            contentDescription = "Dheemafy Logo",
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Dheemafy",
                            color = SpotifyWhite,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(modifier = Modifier.weight(1f))

                        // User Avatar button for Profile & Logout
                        val initial = (user?.name ?: user?.userName ?: "U").take(1).uppercase()
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(SpotifyGreen)
                                .clickable { showProfileDialog = true },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = initial,
                                color = SpotifyBlack,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Header Greeting
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp)
                    ) {
                        Text(
                            text = "$greeting, ${user?.name ?: "Sharu"}",
                            color = SpotifyWhite,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Playlists Shelf: (+ Create Playlist FIRST, User Playlists NEXT, Featured Playlists AFTER)
                item {
                    Text(
                        text = "Playlists",
                        color = SpotifyWhite,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp)
                    ) {
                        // 1. "+ Create Playlist" Card FIRST
                        item(key = "create_playlist_card") {
                            CreatePlaylistCard(
                                onClick = { showCreatePlaylistDialog = true }
                            )
                        }

                        // 2. User-created playlists NEXT (in first place!)
                        items(userPlaylists, key = { it.id }) { pl ->
                            UserPlaylistItemCard(
                                playlist = pl,
                                onClick = { onPlaylistClick(pl.id, pl.name) }
                            )
                        }

                        // 3. Featured / Library Playlists
                        items(data.featuredPlaylists, key = { it.id }) { playlist ->
                            PlaylistItemCard(
                                playlist = playlist,
                                onClick = { onPlaylistClick(playlist.id, playlist.name) },
                                baseUrl = sessionManager.getBaseUrl()
                            )
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
                    items(data.quickPicks, key = { it.id }) { song ->
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
                            },
                            onAddToPlaylistClick = {
                                songToAddToPlaylist = song
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
                            items(data.popularArtists, key = { it.id }) { artist ->
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
                    items(data.trending, key = { it.id }) { song ->
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
                            },
                            onAddToPlaylistClick = {
                                songToAddToPlaylist = song
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CreatePlaylistCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(140.dp)
            .clickable { onClick() }
            .padding(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(124.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(SpotifyDarkSurface),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(CircleShape)
                        .background(SpotifyGreen),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Create Playlist",
                        tint = SpotifyBlack,
                        modifier = Modifier.size(28.dp)
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "New Playlist",
                    color = SpotifyWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Create Playlist",
            color = SpotifyWhite,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(2.dp))

        Text(
            text = "Tap to create",
            color = SpotifyGreen,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun UserPlaylistItemCard(
    playlist: UserPlaylist,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(140.dp)
            .clickable { onClick() }
            .padding(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(124.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF0F5132), Color(0xFF132A13), SpotifyCard)
                    )
                )
                .padding(10.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.LibraryMusic,
                    contentDescription = null,
                    tint = SpotifyGreen,
                    modifier = Modifier.size(34.dp)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "YOUR PLAYLIST",
                    color = SpotifyGreenBright,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    maxLines = 1
                )
                Text(
                    text = playlist.name,
                    color = SpotifyWhite,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = playlist.name,
            color = SpotifyWhite,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(2.dp))

        val count = playlist.songIds.size
        Text(
            text = "$count ${if (count == 1) "song" else "songs"}",
            color = SpotifyGrayText,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
