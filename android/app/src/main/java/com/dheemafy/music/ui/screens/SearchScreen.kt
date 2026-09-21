package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.data.model.SearchData
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.ArtistItemCard
import com.dheemafy.music.ui.components.SongRow
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(
    repository: MusicRepository,
    playbackManager: PlaybackManager,
    playbackState: PlaybackState,
    onArtistClick: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var searchData by remember { mutableStateOf<SearchData?>(null) }
    var isSearching by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        val trimmed = query.trim()
        if (trimmed.isBlank()) {
            searchData = null
            isSearching = false
            return@LaunchedEffect
        }
        delay(300) // Debounce 300ms
        isSearching = true
        repository.search(trimmed).fold(
            onSuccess = { data ->
                searchData = data
                isSearching = false
            },
            onFailure = {
                isSearching = false
            }
        )
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SpotifyBlack)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header Title
            Text(
                text = "Search",
                color = SpotifyWhite,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 12.dp)
            )

            // Search Text Field
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("What do you want to play?", color = SpotifyGrayText, fontSize = 14.sp) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = SpotifyGrayText
                    )
                },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = "Clear search",
                                tint = SpotifyGrayText
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = SpotifyCard,
                    unfocusedContainerColor = SpotifyCard,
                    focusedBorderColor = SpotifyGreen,
                    unfocusedBorderColor = SpotifyCard,
                    focusedTextColor = SpotifyWhite,
                    unfocusedTextColor = SpotifyWhite
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            if (isSearching) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = SpotifyGreen, modifier = Modifier.size(32.dp))
                }
            } else if (query.isBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Find your favorite songs, playlists, or artists",
                        color = SpotifySubtleGray,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            } else {
                val data = searchData
                val songs = remember(data) { (data?.songs ?: emptyList()).sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title.trim() }) }
                val artists = data?.artists ?: emptyList()

                if (songs.isEmpty() && artists.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No results found for \"$query\"",
                            color = SpotifyGrayText,
                            fontSize = 15.sp
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 120.dp)
                    ) {
                        // Artists Results Row
                        if (artists.isNotEmpty()) {
                            item {
                                Text(
                                    text = "Artists",
                                    color = SpotifyWhite,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                                )
                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = 12.dp)
                                ) {
                                    items(artists) { artist ->
                                        ArtistItemCard(
                                            artist = artist,
                                            onClick = { onArtistClick(artist.id, artist.name) }
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.height(16.dp))
                            }
                        }

                        // Songs Results
                        if (songs.isNotEmpty()) {
                            item {
                                Text(
                                    text = "Songs",
                                    color = SpotifyWhite,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                                )
                            }
                            items(songs) { song ->
                                val isCurrent = playbackState.currentSong?.id == song.id
                                SongRow(
                                    song = song,
                                    isCurrentSong = isCurrent,
                                    isPlaying = isCurrent && playbackState.isPlaying,
                                    onSongClick = {
                                        val idx = songs.indexOf(song)
                                        playbackManager.playQueue(songs, idx, "Search: $query")
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
    }
}
