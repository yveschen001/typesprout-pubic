import React from 'react'
import { Helmet } from 'react-helmet-async'
import { supportedLangs } from '../../config/app'

type Props = {
  title: string
  description: string
  canonicalPath: string // must start with "/{lang}/..."
}

export default function Seo({ title, description, canonicalPath }: Props) {
  const siteBase = (import.meta.env.VITE_SITE_BASE as string) || (typeof location !== 'undefined' ? location.origin : '')
  const lang = canonicalPath.split('/')[1] || 'en-US'
  const canonical = siteBase ? `${siteBase}${canonicalPath}` : canonicalPath

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: title,
    description,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    url: canonical,
    inLanguage: lang,
  }

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {siteBase && <link rel="canonical" href={canonical} />}
      {siteBase && supportedLangs.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={`${siteBase}/${l}${canonicalPath.replace(`/${lang}`, '')}`} />
      ))}
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  )
}


