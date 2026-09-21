package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dheemafy.music.data.local.SessionManager
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: MusicRepository,
    sessionManager: SessionManager,
    onLoginSuccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current

    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf(sessionManager.getBaseUrl()) }
    var showServerConfig by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SpotifyBlack)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.GraphicEq,
                contentDescription = "Dheemafy Logo",
                tint = SpotifyGreen,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Dheemafy",
                color = SpotifyWhite,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = "Private High-Fidelity Music Streaming",
                color = SpotifyGrayText,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 4.dp, bottom = 32.dp)
            )

            if (errorMessage != null) {
                Surface(
                    color = SpotifyError.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp)
                ) {
                    Text(
                        text = errorMessage ?: "",
                        color = SpotifyError,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            OutlinedTextField(
                value = username,
                onValueChange = {
                    username = it
                    errorMessage = null
                },
                label = { Text("Username") },
                placeholder = { Text("sharu or you") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = SpotifyGreen,
                    unfocusedBorderColor = SpotifyDivider,
                    focusedTextColor = SpotifyWhite,
                    unfocusedTextColor = SpotifyWhite,
                    focusedLabelColor = SpotifyGreen,
                    unfocusedLabelColor = SpotifyGrayText
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = {
                    password = it
                    errorMessage = null
                },
                label = { Text("Password") },
                placeholder = { Text("••••••••") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = SpotifyGreen,
                    unfocusedBorderColor = SpotifyDivider,
                    focusedTextColor = SpotifyWhite,
                    unfocusedTextColor = SpotifyWhite,
                    focusedLabelColor = SpotifyGreen,
                    unfocusedLabelColor = SpotifyGrayText
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (username.isBlank() || password.isBlank()) {
                        errorMessage = "Please enter both username and password"
                        return@Button
                    }
                    scope.launch {
                        isLoading = true
                        errorMessage = null
                        val result = repository.login(username.trim(), password.trim())
                        isLoading = false
                        result.fold(
                            onSuccess = { onLoginSuccess() },
                            onFailure = { err ->
                                errorMessage = err.message ?: "Login failed. Please verify credentials."
                            }
                        )
                    }
                },
                enabled = !isLoading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = SpotifyGreen,
                    contentColor = SpotifyBlack
                ),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = SpotifyBlack,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "LOG IN",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            TextButton(
                onClick = { showServerConfig = !showServerConfig }
            ) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = null,
                    tint = SpotifySubtleGray,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (showServerConfig) "Hide Server Settings" else "Configure Server URL",
                    color = SpotifySubtleGray,
                    fontSize = 12.sp
                )
            }

            if (showServerConfig) {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = {
                        serverUrl = it
                        sessionManager.saveBaseUrl(it)
                    },
                    label = { Text("Server Base URL") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = SpotifyGreen,
                        unfocusedBorderColor = SpotifyDivider,
                        focusedTextColor = SpotifyWhite,
                        unfocusedTextColor = SpotifyWhite,
                        focusedLabelColor = SpotifyGreen,
                        unfocusedLabelColor = SpotifyGrayText
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
