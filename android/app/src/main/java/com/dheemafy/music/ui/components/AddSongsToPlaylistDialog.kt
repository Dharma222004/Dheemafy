package com.dheemafy.music.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dheemafy.music.data.local.UserPlaylistManager
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun AddSongsToPlaylistDialog(
    playlistId: String,
    playlistName: String,
    userPlaylistManager: UserPlaylistManager,
    repository: MusicRepository,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var searchQuery by remember { mutableStateOf("") }
    var allSongs by remember { mutableStateOf<List<Song>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    val userPlaylists by userPlaylistManager.playlists.collectAsState()
    val currentPlaylist = remember(userPlaylists, playlistId) {
        userPlaylists.find { it.id == playlistId }
    }
    val addedSongIds = remember(currentPlaylist) {
        currentPlaylist?.songIds?.toSet() ?: emptySet()
    }

    LaunchedEffect(Unit) {
        scope.launch {
            isLoading = true
            repository.getSongs(limit = 1000).fold(
                onSuccess = { songs ->
                    allSongs = songs
                    isLoading = false
                },
                onFailure = {
                    isLoading = false
                }
            )
        }
    }

    val filteredSongs = remember(searchQuery, allSongs) {
        val query = searchQuery.trim().lowercase()
        if (query.isEmpty()) {
            allSongs
        } else {
            allSongs.filter { song ->
                song.title.lowercase().contains(query) ||
                song.displayArtist.lowercase().contains(query) ||
                (song.movie?.lowercase()?.contains(query) == true)
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 32.dp),
            shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
            color = SpotifyBlack
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                // Header Bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Add Songs",
                            color = SpotifyWhite,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "To: $playlistName (${addedSongIds.size} songs)",
                            color = SpotifyGrayText,
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(36.dp)
                            .background(SpotifyDarkSurface, CircleShape)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = SpotifyWhite,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Search Input Field
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = {
                        Text("Search songs, artists, movies...", color = SpotifyGrayText, fontSize = 14.sp)
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search",
                            tint = SpotifyGrayText
                        )
                    },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Clear",
                                    tint = SpotifyGrayText,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = SpotifyWhite,
                        unfocusedTextColor = SpotifyWhite,
                        focusedBorderColor = SpotifyGreen,
                        unfocusedBorderColor = SpotifyDivider,
                        cursorColor = SpotifyGreen,
                        focusedContainerColor = SpotifyDarkSurface,
                        unfocusedContainerColor = SpotifyDarkSurface
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Song list or Loading State
                if (isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = SpotifyGreen)
                    }
                } else if (filteredSongs.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (searchQuery.isEmpty()) "No songs found" else "No matching songs found",
                            color = SpotifyGrayText,
                            fontSize = 14.sp
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        items(filteredSongs, key = { it.id }) { song ->
                            val isAdded = addedSongIds.contains(song.id)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 6.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        userPlaylistManager.toggleSongInPlaylist(playlistId, song.id)
                                    }
                                    .padding(horizontal = 4.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                SongCoverImage(
                                    rawUrl = song.resolvedCoverImageUrl,
                                    title = song.title,
                                    size = 46.dp,
                                    shape = RoundedCornerShape(4.dp)
                                )

                                Spacer(modifier = Modifier.width(12.dp))

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = song.title,
                                        color = SpotifyWhite,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = song.displaySubtext,
                                        color = SpotifyGrayText,
                                        fontSize = 13.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                Spacer(modifier = Modifier.width(8.dp))

                                // Toggle Add / Remove Button
                                IconButton(
                                    onClick = {
                                        userPlaylistManager.toggleSongInPlaylist(playlistId, song.id)
                                    },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .background(
                                            if (isAdded) SpotifyGreen else SpotifyDarkSurface,
                                            CircleShape
                                        )
                                ) {
                                    Icon(
                                        imageVector = if (isAdded) Icons.Default.Check else Icons.Default.Add,
                                        contentDescription = if (isAdded) "Added" else "Add",
                                        tint = if (isAdded) SpotifyBlack else SpotifyWhite,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
