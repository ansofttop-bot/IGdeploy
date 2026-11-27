package app.igseek.mobile.data.api

import app.igseek.mobile.BuildConfig
import app.igseek.mobile.data.models.AuthSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class FirebaseOperationNotAllowedException(message: String) : IllegalStateException(message)

class FirebaseAuthApi(private val client: OkHttpClient) {

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val apiKey: String = BuildConfig.FIREBASE_WEB_API_KEY

    suspend fun signInWithEmail(email: String, password: String): AuthSession = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "Firebase API key не настроен в сборке" }
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
            put("returnSecureToken", true)
        }
        val req = Request.Builder()
            .url("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            val obj = runCatching { JSONObject(raw) }.getOrNull()
            if (!res.isSuccessful) {
                val msg = obj?.optJSONObject("error")?.optString("message") ?: "Ошибка входа (${res.code})"
                if (isOperationNotAllowed(msg)) {
                    throw FirebaseOperationNotAllowedException(translateAuthError(msg))
                }
                throw IllegalStateException(translateAuthError(msg))
            }
            parseAuthResponse(obj ?: JSONObject(), email)
        }
    }

    suspend fun signUpWithEmail(email: String, password: String, displayName: String): AuthSession = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "Firebase API key не настроен в сборке" }
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
            put("returnSecureToken", true)
        }
        val req = Request.Builder()
            .url("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        val session = client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            val obj = runCatching { JSONObject(raw) }.getOrNull()
            if (!res.isSuccessful) {
                val msg = obj?.optJSONObject("error")?.optString("message") ?: "Ошибка регистрации (${res.code})"
                if (isOperationNotAllowed(msg)) {
                    throw FirebaseOperationNotAllowedException(translateAuthError(msg))
                }
                throw IllegalStateException(translateAuthError(msg))
            }
            parseAuthResponse(obj ?: JSONObject(), email, displayName)
        }

        if (displayName.isNotBlank() && session.idToken.isNotBlank()) {
            runCatching {
                val upd = JSONObject().apply {
                    put("idToken", session.idToken)
                    put("displayName", displayName)
                    put("returnSecureToken", false)
                }
                val uReq = Request.Builder()
                    .url("https://identitytoolkit.googleapis.com/v1/accounts:update?key=$apiKey")
                    .post(upd.toString().toRequestBody(jsonMedia))
                    .build()
                client.newCall(uReq).execute().close()
            }
        }
        session
    }

    suspend fun refreshSession(current: AuthSession): AuthSession = withContext(Dispatchers.IO) {
        if (!current.isCloudSynced || current.refreshToken.isBlank() || apiKey.isBlank()) return@withContext current
        if (System.currentTimeMillis() < current.expiresAtMs - 120_000L) return@withContext current

        val body = JSONObject().apply {
            put("grant_type", "refresh_token")
            put("refresh_token", current.refreshToken)
        }
        val req = Request.Builder()
            .url("https://securetoken.googleapis.com/v1/token?key=$apiKey")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@withContext current
            val obj = JSONObject(res.body?.string().orEmpty())
            val newIdToken = obj.optString("id_token")
            val newRefresh = obj.optString("refresh_token").ifBlank { current.refreshToken }
            val expiresSec = obj.optString("expires_in").toLongOrNull() ?: 3600L
            if (newIdToken.isBlank()) return@withContext current
            current.copy(
                idToken = newIdToken,
                refreshToken = newRefresh,
                expiresAtMs = System.currentTimeMillis() + expiresSec * 1000L
            )
        }
    }

    suspend fun signInWithGoogleIdToken(googleIdToken: String): AuthSession = withContext(Dispatchers.IO) {
        signInWithGooglePostBody("id_token=$googleIdToken&providerId=google.com")
    }

    suspend fun signInWithGoogleAccessToken(accessToken: String): AuthSession = withContext(Dispatchers.IO) {
        signInWithGooglePostBody("access_token=$accessToken&providerId=google.com")
    }

    private fun signInWithGooglePostBody(postBody: String): AuthSession {
        require(apiKey.isNotBlank()) { "Firebase API key не настроен в сборке" }
        val authDomain = BuildConfig.FIREBASE_AUTH_DOMAIN.ifBlank { "localhost" }
        val body = JSONObject().apply {
            put("postBody", postBody)
            put("requestUri", "https://$authDomain")
            put("returnIdpCredential", true)
            put("returnSecureToken", true)
        }
        val req = Request.Builder()
            .url("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=$apiKey")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        return client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            val obj = runCatching { JSONObject(raw) }.getOrNull()
            if (!res.isSuccessful) {
                val msg = obj?.optJSONObject("error")?.optString("message") ?: "Ошибка входа через Google (${res.code})"
                throw IllegalStateException(translateAuthError(msg))
            }
            val parsed = obj ?: JSONObject()
            val email = parsed.optString("email")
            val fullName = parsed.optString("fullName").ifBlank { parsed.optString("displayName") }
            parseAuthResponse(parsed, email, fullName)
        }
    }

    suspend fun sendPasswordReset(email: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("requestType", "PASSWORD_RESET")
            put("email", email)
        }
        val req = Request.Builder()
            .url("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=$apiKey")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                throw IllegalStateException("Не удалось отправить письмо для сброса пароля")
            }
        }
    }

    private fun parseAuthResponse(obj: JSONObject, fallbackEmail: String, fallbackName: String = ""): AuthSession {
        val expiresSec = obj.optString("expiresIn").toLongOrNull() ?: 3600L
        return AuthSession(
            uid = obj.optString("localId"),
            email = obj.optString("email").ifBlank { fallbackEmail },
            displayName = obj.optString("displayName").ifBlank { fallbackName.ifBlank { fallbackEmail.substringBefore("@") } },
            idToken = obj.optString("idToken"),
            refreshToken = obj.optString("refreshToken"),
            expiresAtMs = System.currentTimeMillis() + expiresSec * 1000L,
            isGuest = false
        )
    }

    private fun isOperationNotAllowed(code: String): Boolean =
        code.contains("OPERATION_NOT_ALLOWED", ignoreCase = true) ||
            code.contains("ADMIN_RESTRICTED_OPERATION", ignoreCase = true) ||
            code.contains("PASSWORD_LOGIN_DISABLED", ignoreCase = true)

    private fun translateAuthError(code: String): String = when {
        code.contains("INVALID_LOGIN_CREDENTIALS") || code.contains("INVALID_PASSWORD") -> "Неверный email или пароль"
        code.contains("EMAIL_EXISTS") -> "Аккаунт с этим email уже зарегистрирован. Перейдите на вкладку «Вход»."
        code.contains("EMAIL_NOT_FOUND") -> "Аккаунт с таким email не найден"
        code.contains("INVALID_EMAIL") -> "Введите корректный адрес email"
        code.contains("WEAK_PASSWORD") -> "Пароль должен содержать минимум 6 символов"
        code.contains("USER_DISABLED") -> "Этот аккаунт временно отключён"
        code.contains("TOO_MANY_ATTEMPTS") -> "Слишком много попыток, попробуйте чуть позже"
        isOperationNotAllowed(code) -> "Вход и регистрация по почте ещё не включены в Firebase Console (Authentication → Sign-in method → Email/Password). Пока используйте «Войти через Google» — с ним сразу работает облачная синхронизация."
        else -> code
    }
}
