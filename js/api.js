/* KAS public-site API client. Auth tokens stay in HttpOnly cookies. */
(function (global) {
  'use strict';
  var configured = String(global.KAS_API_BASE || '').trim();
  var base = configured || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? ('http://' + location.hostname + ':8080') : location.origin);

  function cookie(name) {
    var prefix = name + '=';
    var row = document.cookie.split('; ').find(function (item) { return item.indexOf(prefix) === 0; });
    if (!row) return '';
    try { return decodeURIComponent(row.slice(prefix.length)); } catch (_) { return row.slice(prefix.length); }
  }
  function message(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload.message === 'string') return payload.message;
    if (Array.isArray(payload.details)) return payload.details.map(function (x) { return x.message || x.code; }).join(' ');
    if (Array.isArray(payload.errors)) return payload.errors.map(function (x) { return x.message || x.code; }).join(' ');
    return payload.error || fallback;
  }
  var refreshing = null;
  function refreshSession() {
    if (!refreshing) {
      refreshing = request('/api/v1/public/auth/refresh', { method: 'POST' })
        .then(function () { return true; }, function () { return false; })
        .then(function (ok) { refreshing = null; return ok; });
    }
    return refreshing;
  }

  function request(path, options, retried, csrfPrimed) {
    options = options || {};
    var method = String(options.method || 'GET').toUpperCase();
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    var body = options.body;
    if (body && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (method !== 'GET' && method !== 'HEAD') {
      var token = cookie('XSRF-TOKEN');
      if (!token && !csrfPrimed) return request('/actuator/health/db', { method: 'GET' }).then(function () { return request(path, options, retried, true); });
      /* Once primed, a still-missing cookie goes to the server and comes back as a
         normal 403 instead of asking for the cookie forever. */
      if (token) headers['X-XSRF-TOKEN'] = token;
    }
    return fetch(base + path, Object.assign({}, options, { method: method, headers: headers, body: body, credentials: 'include' }))
      .then(function (response) {
        if (response.status === 401 && !retried && path.indexOf('/api/v1/public/auth/') !== 0) {
          /* The access cookie (15 min) ran out: renew once, then repeat this
             request. Every request that hits 401 at the same moment shares ONE
             refresh — the backend rotates the refresh token, so a second refresh
             with the same token is refused, and that refusal used to look like
             a sign-out. The request is repeated even if this tab's refresh lost
             a race: another request or tab may already have renewed the cookies. */
          return refreshSession().then(function () {
            return request(path, options, true);
          });
        }
        if (response.status === 204) return null;
        return response.text().then(function (text) {
          var payload = null;
          try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = { message: text }; }
          if (!response.ok) {
            var detail = message(payload, 'Máy chủ không cung cấp thông tin chi tiết.');
            var isVietnamese = global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi';
            if (isVietnamese) {
              var translatedDetail = global.KAS_I18N.t(detail);
              detail = translatedDetail === detail
                ? 'Vui lòng kiểm tra thông tin và thử lại.'
                : translatedDetail;
            }
            var userMessage = response.status === 401
              ? (isVietnamese ? 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.' : 'Email or password is incorrect. Please check and try again.')
              : response.status === 403
                ? (isVietnamese ? 'Bạn không có quyền thực hiện thao tác này.' : 'You do not have permission to perform this action.')
                : (isVietnamese ? 'Không thể thực hiện yêu cầu. ' : 'The request could not be completed. ') + detail;
            var error = new Error(userMessage);
            error.status = response.status;
            error.payload = payload;
            throw error;
          }
          return payload;
        });
      })
      .catch(function (error) {
        // Browsers intentionally hide the underlying reason for network and
        // CORS failures. Replace the unhelpful native "Failed to fetch" with
        // a clear, actionable message; HTTP errors above keep their API detail.
        if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message || '')) {
          var networkError = new Error(
            'Không nhận được phản hồi từ máy chủ API tại ' + base +
            '. Có thể máy chủ chưa chạy hoặc trình duyệt bị chặn kết nối. ' +
            'Kiểm tra tại ' + base + '/actuator/health rồi thử lại.'
          );
          networkError.code = 'NETWORK_ERROR';
          networkError.cause = error;
          throw networkError;
        }
        throw error;
      });
  }

  global.KAS_API = {
    base: base,
    request: request,
    login: function (email, password) {
      return request('/api/v1/public/auth/login', { method: 'POST', body: { email: email, password: password } });
    },
    register: function (data) {
      return request('/api/v1/public/auth/customer-register', { method: 'POST', body: data });
    },
    resendVerification: function(email) { return request('/api/v1/public/auth/resend-verification', {method:'POST',body:{email:email}}); },
    verifyEmail: function(email, code) { return request('/api/v1/public/auth/verify-email', {method:'POST',body:{email:email,code:code}}); },
    forgotPassword: function (email) {
      return request('/api/v1/public/auth/forgot-password', { method: 'POST', body: { email: email } });
    },
    resetPassword: function (token, newPassword) {
      return request('/api/v1/public/auth/reset-password', { method: 'POST', body: { token: token, newPassword: newPassword } });
    },
    logout: function () { return request('/api/v1/public/auth/logout', { method: 'POST' }); },
    profile: function () { return request('/api/v1/me/profile'); },
    updateProfile: function (data) { return request('/api/v1/me/profile', { method: 'PUT', body: data }); },
    /* Profile photo, stored with the account. `image` is a data URL (JPEG/PNG/WebP, at most 512 KB). */
    updateAvatar: function (image) { return request('/api/v1/me/profile/avatar', { method: 'PUT', body: { image: image } }); },
    deleteAvatar: function () { return request('/api/v1/me/profile/avatar', { method: 'DELETE' }); },
    /* An API path (such as profile.avatarUrl) as an absolute URL on the API origin. */
    url: function (path) { return path ? base + path : ''; },
    stays: function (locale) { return request('/api/v1/me/stays?locale=' + encodeURIComponent(locale || 'en')); },
    /* The guest asks to check out; SUPER_ADMIN confirms (membership tier review, V59). */
    requestCheckout: function (reference) { return request('/api/v1/me/stays/' + encodeURIComponent(reference) + '/check-out-request', { method: 'POST' }); },
    requestCancellation: function (reference) { return request('/api/v1/me/stays/' + encodeURIComponent(reference) + '/cancel', { method: 'POST' }); },
    decideCancellation: function (reference, accept) { return request('/api/v1/me/stays/' + encodeURIComponent(reference) + '/cancel/decision', { method: 'POST', body: { accept: !!accept } }); },
    submitReservation: function (body, key, locale) {
      return request('/api/v1/public/reservations/requests?locale=' + encodeURIComponent(locale || 'en'), {
        method: 'POST', headers: { 'Idempotency-Key': key }, body: body
      });
    },
    receipt: function (reference) {
      return request('/api/v1/public/reservations/requests/' + encodeURIComponent(reference) + '/sent');
    }
  };
})(window);
