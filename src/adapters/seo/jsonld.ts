export function softwareAppJsonLd(params: {
  name: string
  description: string
  url: string
  applicationCategory?: string
  inLanguage?: string
}) {
  const { name, description, url, applicationCategory = 'EducationalApplication', inLanguage = 'en-US' } = params
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    applicationCategory,
    operatingSystem: 'Web',
    url,
    inLanguage,
  }
}

export function learningResourceJsonLd(params: {
  name: string
  description: string
  url: string
  inLanguage?: string
}) {
  const { name, description, url, inLanguage = 'en-US' } = params
  return {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name,
    description,
    url,
    inLanguage,
    audience: { '@type': 'EducationalAudience', educationalRole: 'student' },
  }
}


