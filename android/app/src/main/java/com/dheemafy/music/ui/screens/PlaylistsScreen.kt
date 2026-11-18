package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.data.local.UserPlaylist
import com.dheemafy.music.data.local.UserPlaylistManager
import com.dheemafy.music.data.model.Playlist
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.ui.components.CreatePlaylistDialog
import com.dheemafy.music.ui.components.PlaylistFallbackCard
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun PlaylistsScreen(
    repository: MusicRepository,
    userPlaylistManager: UserPlaylistManager,
    onPlaylistClick: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val userPlaylists by userPlaylistManager.playlists.collectAsState()
    var featuredPlaylists by remember { mutableStateOf<List<Playlist>>(emptyList()) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var playlistToDelete by remember { mutableStateOf<UserPlaylist?>(null) }
    var totalSongCount by remember { mutableIntStateOf(569) }

    LaunchedEffect(Unit) {
        scope.launch {
            repository.getPlaylists().onSuccess { list ->
                featuredPlaylists = list
            }
            repository.getSongs(limit = 1000).onSuccess { songs ->
                totalSongCount = songs.size
            }
        }
    }

    if (showCreateDialog) {
        CreatePlaylistDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = { name ->
                showCreateDialog = false
                val newPl = userPlaylistManager.createPlaylist(name)
                onPlaylistClick(newPl.id, newPl.name)
            }
        )
    }

    if (playlistToDelete != null) {
        AlertDialog(
            onDismissRequest = { playlistToDelete = null },
            containerColor = SpotifyCard,
            shape = RoundedCornerShape(16.dp),
            title = {
                Text("Delete playlist", color = SpotifyWhite, fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    "Are you sure you want to delete \"${playlistToDelete?.name}\"?",
                    color = SpotifyGrayText
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        playlistToDelete?.let { userPlaylistManager.deletePlaylist(it.id) }
                        playlistToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SpotifyError, contentColor = SpotifyWhite)
                ) {
                    Text("Delete", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { playlistToDelete = null }) {
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
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 120.dp)
        ) {
            // Header Bar
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Your Library",
                        color = SpotifyWhite,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )

                    IconButton(
                        onClick = { showCreateDialog = true },
                        modifier = Modifier
                            .size(40.dp)
                            .background(SpotifyGreen, CircleShape)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Create Playlist",
                            tint = SpotifyBlack,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }

            // Create Playlist Prompt Banner
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(SpotifyDarkSurface)
                        .clickable { showCreateDialog = true }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(SpotifyGreen),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = null,
                            tint = SpotifyBlack,
                            modifier = Modifier.size(26.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Create playlist",
                            color = SpotifyWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Build your own custom mix of songs",
                            color = SpotifyGrayText,
                            fontSize = 13.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))
            }

            // User Playlists Section (In FIRST place!)
            if (userPlaylists.isNotEmpty()) {
                item {
                    Text(
                        text = "Your Playlists",
                        color = SpotifyWhite,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }

                items(userPlaylists, key = { it.id }) { pl ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onPlaylistClick(pl.id, pl.name) }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(
                                    Brush.verticalGradient(
                                        listOf(Color(0xFF0F5132), Color(0xFF132A13), SpotifyCard)
                                    )
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.LibraryMusic,
                                contentDescription = null,
                                tint = SpotifyGreen,
                                modifier = Modifier.size(26.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = pl.name,
                                color = SpotifyWhite,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(modifier = Modifier.height(3.dp))
                            val count = pl.songIds.size
                            Text(
                                text = "Playlist • $count ${if (count == 1) "song" else "songs"}",
                                color = SpotifyGrayText,
                                fontSize = 13.sp
                            )
                        }

                        IconButton(
                            onClick = { playlistToDelete = pl },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.DeleteOutline,
                                contentDescription = "Delete",
                                tint = SpotifyGrayText,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(20.dp))
                }
            }

            // Catalog & Curated Playlists
            item {
                Text(
                    text = "Library Catalog",
                    color = SpotifyWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }

            // All Songs Card
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onPlaylistClick("all-songs", "All Songs") }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(6.dp))
                    ) {
                        PlaylistFallbackCard(name = "All Songs")
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "All Songs",
                            color = SpotifyWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = "Playlist • $totalSongCount songs",
                            color = SpotifyGrayText,
                            fontSize = 13.sp
                        )
                    }

                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = "Play",
                        tint = SpotifyGreen,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            // Other curated playlists from API
            items(featuredPlaylists.filter { it.id != "all-songs" }, key = { it.id }) { playlist ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onPlaylistClick(playlist.id, playlist.name) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(6.dp))
                    ) {
                        PlaylistFallbackCard(name = playlist.name)
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = playlist.name,
                            color = SpotifyWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.height(3.dp))
                        val count = playlist.songCount ?: 0
                        Text(
                            text = "Playlist • $count tracks",
                            color = SpotifyGrayText,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        }
    }
}
