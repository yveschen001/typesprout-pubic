export const analytics = {
  init() {
    const useGA = import.meta.env.VITE_USE_GA === 'true'
    const useCF = import.meta.env.VITE_USE_CF === 'true'
    if (useGA && useCF) { console.warn('Both GA4 and CF enabled; skipping.'); return }
    if (useGA) this.initGA()
    if (useCF) this.initCF()
  },
  initGA() {
    const m = document.createElement('script')
    m.async = true
    m.src = `https://www.googletagmanager.com/gtag/js?id=${import.meta.env.VITE_GA_ID}`
    document.head.appendChild(m)
    // Consent Mode defaults
    ;(window as any).dataLayer = (window as any).dataLayer || []
    function gtag(){ (window as any).dataLayer.push(arguments) }
    gtag('consent', 'default', { ad_user_data: 'denied', ad_personalization: 'denied', ad_storage: 'denied', analytics_storage: 'granted' })
    gtag('js', new Date())
    gtag('config', import.meta.env.VITE_GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false, ads_data_redaction: true })
  },
  initCF() {
    const s = document.createElement('script')
    s.defer = true
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js'
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: import.meta.env.VITE_CF_TOKEN }))
    document.head.appendChild(s)
  }
}

export default analytics


