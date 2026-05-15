/**
 * sc_overlay_tracker.cpp
 *
 * Addon natif Node-API (NAPI) pour tracker la fenêtre Star Citizen.
 * Utilise Win32 + DWM API directement — aucun process externe, aucune injection.
 *
 * API exposée :
 *   startTracking({ processName: 'StarCitizen.exe' }) → void
 *   stopTracking()                                    → void
 *   getState()                                        → SCWindowState
 *
 * SCWindowState :
 *   found     : boolean  — le processus est trouvé avec une fenêtre principale
 *   visible   : boolean  — la fenêtre est visible (non minimisée)
 *   focused   : boolean  — la fenêtre est au premier plan
 *   minimized : boolean  — la fenêtre est minimisée (IsIconic)
 *   x, y      : number   — position en pixels physiques (DPI brut)
 *   width     : number   — largeur en pixels physiques
 *   height    : number   — hauteur en pixels physiques
 *
 * Les coordonnées sont en pixels physiques (raw DPI).
 * La conversion en pixels logiques (DPI scaling) est faite côté JS avec
 * screen.getPrimaryDisplay().scaleFactor comme dans l'existant.
 */

#include <napi.h>
#include <windows.h>
#include <dwmapi.h>

#include <string>
#include <algorithm>
#include <cwchar>
#include <cwctype>

// ─── État global ──────────────────────────────────────────────────────────────

static std::wstring g_processName; // Nom de l'exe cible (ex: L"StarCitizen.exe")

// ─── Utilitaires ──────────────────────────────────────────────────────────────

static std::wstring ToLower(std::wstring s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](wchar_t c) { return static_cast<wchar_t>(std::towlower(c)); });
    return s;
}

/**
 * Convertit une chaîne UTF-8 (venue de JS) en wstring Windows.
 */
static std::wstring Utf8ToWide(const std::string& utf8) {
    if (utf8.empty()) return {};

    // Première passe : obtenir la taille nécessaire (inclut le null final)
    int len = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
    if (len <= 0) return {};

    // Deuxième passe : conversion réelle
    std::wstring wide(static_cast<size_t>(len), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &wide[0], len);

    // Supprimer le null terminal embarqué dans le wstring
    if (!wide.empty() && wide.back() == L'\0') {
        wide.pop_back();
    }
    return wide;
}

// ─── Recherche de la fenêtre par nom d'exe ────────────────────────────────────

struct FindWindowData {
    std::wstring targetExeLower; // Nom exe en minuscules pour comparaison insensible à la casse
    HWND         hwnd;           // Résultat : handle trouvé (nullptr si non trouvé)
};

/**
 * Callback pour EnumWindows.
 * Cherche la première fenêtre top-level visible dont le processus correspond à targetExeLower.
 * Retourne FALSE pour stopper l'énumération dès qu'une correspondance est trouvée.
 */
static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    auto* fd = reinterpret_cast<FindWindowData*>(lParam);

    // Ignorer les fenêtres non visibles
    if (!IsWindowVisible(hwnd)) return TRUE;

    // Ignorer les fenêtres tool (barre des tâches, tooltips, tray icons...)
    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if (exStyle & WS_EX_TOOLWINDOW) return TRUE;

    // Récupérer le PID de la fenêtre
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid == 0) return TRUE;

    // Ouvrir le processus avec le minimum de droits pour QueryFullProcessImageNameW
    HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!hProc) return TRUE;

    wchar_t exePath[MAX_PATH] = {};
    DWORD   pathLen = MAX_PATH;
    BOOL    matched = FALSE;

    if (QueryFullProcessImageNameW(hProc, 0, exePath, &pathLen)) {
        // Extraire uniquement le nom de l'exe (sans le chemin complet)
        std::wstring full(exePath);
        size_t pos = full.rfind(L'\\');
        std::wstring exeName = (pos != std::wstring::npos) ? full.substr(pos + 1) : full;

        if (ToLower(exeName) == fd->targetExeLower) {
            fd->hwnd = hwnd;
            matched = TRUE;
        }
    }

    CloseHandle(hProc);
    return matched ? FALSE : TRUE; // FALSE = stopper l'énumération
}

/**
 * Cherche et retourne le HWND de la fenêtre principale de l'exe cible.
 * Retourne nullptr si non trouvé.
 */
static HWND FindGameWindow() {
    if (g_processName.empty()) return nullptr;

    FindWindowData fd;
    fd.targetExeLower = ToLower(g_processName);
    fd.hwnd = nullptr;

    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&fd));
    return fd.hwnd;
}

// ─── Helpers RECT ─────────────────────────────────────────────────────────────

/**
 * Remplit les coordonnées dans un objet Napi avec les champs x/y/width/height.
 */
static void SetRectFields(Napi::Object& obj, const RECT& r) {
    obj.Set("x",      static_cast<int>(r.left));
    obj.Set("y",      static_cast<int>(r.top));
    obj.Set("width",  static_cast<int>(r.right  - r.left));
    obj.Set("height", static_cast<int>(r.bottom - r.top));
}

static void SetEmptyRect(Napi::Object& obj) {
    obj.Set("x",      0);
    obj.Set("y",      0);
    obj.Set("width",  0);
    obj.Set("height", 0);
}

// ─── Exports NAPI ─────────────────────────────────────────────────────────────

/**
 * startTracking({ processName: string }) → void
 *
 * Définit le nom de l'exe à tracker. Appel idempotent.
 * Exemple : tracker.startTracking({ processName: 'StarCitizen.exe' })
 */
static Napi::Value StartTracking(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "startTracking: argument attendu { processName: string }")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    auto opts = info[0].As<Napi::Object>();
    if (!opts.Has("processName") || !opts.Get("processName").IsString()) {
        Napi::TypeError::New(env, "startTracking: options.processName doit être une string")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string utf8Name = opts.Get("processName").As<Napi::String>().Utf8Value();
    g_processName = Utf8ToWide(utf8Name);

    return env.Undefined();
}

/**
 * stopTracking() → void
 *
 * Réinitialise le nom de l'exe. getState() retournera found=false.
 */
static Napi::Value StopTracking(const Napi::CallbackInfo& info) {
    g_processName.clear();
    return info.Env().Undefined();
}

/**
 * getState() → SCWindowState
 *
 * Retourne l'état courant de la fenêtre Star Citizen.
 * Appel synchrone, typiquement < 2 ms (EnumWindows sur ~50-100 fenêtres).
 *
 * À appeler depuis le main process Electron via setInterval ou similaire.
 */
static Napi::Value GetState(const Napi::CallbackInfo& info) {
    Napi::Env env    = info.Env();
    auto      result = Napi::Object::New(env);

    // Cas : pas de tracking configuré
    if (g_processName.empty()) {
        result.Set("found",     false);
        result.Set("visible",   false);
        result.Set("focused",   false);
        result.Set("minimized", false);
        SetEmptyRect(result);
        return result;
    }

    HWND hwnd = FindGameWindow();

    // Cas : fenêtre non trouvée (processus absent ou sans fenêtre principale)
    if (!hwnd) {
        result.Set("found",     false);
        result.Set("visible",   false);
        result.Set("focused",   false);
        result.Set("minimized", false);
        SetEmptyRect(result);
        return result;
    }

    bool minimized = (IsIconic(hwnd) != 0);
    bool visible   = (IsWindowVisible(hwnd) != 0);
    bool focused   = (GetForegroundWindow() == hwnd);

    // Obtenir les bounds réelles via DWM (exclut l'ombre DWM invisible en mode fenêtré)
    // DWMWA_EXTENDED_FRAME_BOUNDS = 9
    RECT rect = {};
    HRESULT hr = DwmGetWindowAttribute(hwnd,
                                       DWMWA_EXTENDED_FRAME_BOUNDS,
                                       &rect, sizeof(rect));
    if (FAILED(hr)) {
        // Fallback : GetWindowRect (inclut les bordures DWM, ok pour fullscreen/borderless)
        GetWindowRect(hwnd, &rect);
    }

    result.Set("found",     true);
    result.Set("visible",   visible);
    result.Set("focused",   focused);
    result.Set("minimized", minimized);
    SetRectFields(result, rect);

    return result;
}

/**
 * focusGameWindow() → boolean
 *
 * Donne le focus à la fenêtre du jeu via SetForegroundWindow.
 * Retourne true si la fenêtre a été trouvée et SetForegroundWindow appelé.
 * Utilisé à la fermeture de l'éditeur overlay pour rendre la souris au jeu.
 */
static Napi::Value FocusGameWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    HWND hwnd = FindGameWindow();
    if (!hwnd) return Napi::Boolean::New(env, false);

    // AllowSetForegroundWindow permet à ce process de voler le focus même sans input récent
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    AllowSetForegroundWindow(pid);

    BOOL ok = SetForegroundWindow(hwnd);
    return Napi::Boolean::New(env, ok != 0);
}

// ─── Initialisation du module ─────────────────────────────────────────────────

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("startTracking",   Napi::Function::New(env, StartTracking));
    exports.Set("stopTracking",    Napi::Function::New(env, StopTracking));
    exports.Set("getState",        Napi::Function::New(env, GetState));
    exports.Set("focusGameWindow", Napi::Function::New(env, FocusGameWindow));
    return exports;
}

NODE_API_MODULE(sc_overlay_tracker, Init)
