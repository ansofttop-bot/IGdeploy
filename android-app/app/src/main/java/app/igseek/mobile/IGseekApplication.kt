package app.igseek.mobile

import android.app.Application
import app.igseek.mobile.data.api.FirebaseAuthApi
import app.igseek.mobile.data.api.IGseekApiClient
import app.igseek.mobile.data.local.LocalStore
import app.igseek.mobile.data.network.NetworkMonitor
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class IGseekApplication : Application() {

    lateinit var okHttpClient: OkHttpClient
        private set
    lateinit var localStore: LocalStore
        private set
    lateinit var networkMonitor: NetworkMonitor
        private set
    lateinit var authApi: FirebaseAuthApi
        private set
    lateinit var apiClient: IGseekApiClient
        private set

    override fun onCreate() {
        super.onCreate()
        okHttpClient = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        localStore = LocalStore(this)
        networkMonitor = NetworkMonitor(this)
        authApi = FirebaseAuthApi(okHttpClient)
        apiClient = IGseekApiClient(okHttpClient) { localStore.getServerBaseUrl() }
    }
}
