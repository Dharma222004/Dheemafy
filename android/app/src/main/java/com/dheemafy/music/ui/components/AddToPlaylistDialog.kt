package com.dheemafy.music.ui.components

import android.widget.Toast
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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.data.local.UserPlaylist
import com.dheemafy.music.data.local.UserPlaylistManager
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.ui.theme.*

@Composable
fun AddToPlaylistDialog(
    song: Song,
    userPlaylistManager: UserPlaylistManager,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val playlists by userPlaylistManager.playlists.collectAsState()
    var showCreateDialog by remember { mutableStateOf(false) }

    if (showCreateDialog) {
        CreatePlaylistDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = { name ->
                val newPl = userPlaylistManager.createPlaylist(name)
                userPlaylistManager.addSongToPlaylist(newPl.id, song.id)
                Toast.makeText(context, "Created and added to \"${newPl.name}\"", Toast.LENGTH_SHORT).show()
                showCreateDialog = false
                onDismiss()
            }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SpotifyCard,
        shape = RoundedCornerShape(16.dp),
        title = {
            Column {
                Text(
                    text = "Add to playlist",
                    color = SpotifyWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = song.title,
                    color = SpotifyGrayText,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 350.dp)
            ) {
                // Button to create a new playlist
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { showCreateDialog = true }
                        .padding(vertical = 10.dp, horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(SpotifyGreen),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "New playlist",
                            tint = SpotifyBlack,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "New playlist",
                        color = SpotifyWhite,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                HorizontalDivider(color = SpotifyDivider, modifier = Modifier.padding(vertical = 8.dp))

                if (playlists.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 20.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No playlists created yet",
                            color = SpotifyGrayText,
                            fontSize = 13.sp
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(playlists, key = { it.id }) { pl ->
                            val isAdded = pl.songIds.contains(song.id)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        val added = userPlaylistManager.toggleSongInPlaylist(pl.id, song.id)
                                        val msg = if (added) "Added to \"${pl.name}\"" else "Removed from \"${pl.name}\""
                                        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                    }
                                    .padding(vertical = 8.dp, horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val initial = pl.name.take(1).uppercase()
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (isAdded) SpotifyGreen else SpotifyDivider),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = initial,
                                        color = if (isAdded) SpotifyBlack else SpotifyWhite,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = pl.name,
                                        color = SpotifyWhite,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${pl.songIds.size} songs",
                                        color = SpotifyGrayText,
                                        fontSize = 12.sp
                                    )
                                }

                                if (isAdded) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = "Added",
                                        tint = SpotifyGreen,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done", color = SpotifyGreen, fontWeight = FontWeight.Bold)
            }
        }
    )
}
