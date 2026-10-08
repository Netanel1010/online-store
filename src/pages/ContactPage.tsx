import { paths } from '@/app/paths'
import {
  ExternalLink,
  InfoLink,
  InfoList,
  InfoPage,
  InfoPageLink,
  InfoSection,
} from '@/components/shared/InfoPage'
import { GITHUB_PROFILE_URL, GITHUB_REPOSITORY_URL } from '@/lib/links'

export function ContactPage() {
  return (
    <InfoPage
      id="contact"
      intro={
        <>
          <span dir="ltr">N.M.S</span> היא אתר הדגמה ואינה עסק פעיל. לכן אין בה שירות לקוחות, טלפון,
          כתובת או שעות פעילות, ואין טופס יצירת קשר.
        </>
      }
    >
      <InfoSection title="לשאלות על הפרויקט">
        <p>את האתר בנה Netanel1010. אפשר לפנות אליו דרך GitHub:</p>
        <InfoList>
          <li>
            <ExternalLink href={GITHUB_PROFILE_URL}>הפרופיל ב-GitHub</ExternalLink>
          </li>
          <li>
            <ExternalLink href={GITHUB_REPOSITORY_URL}>מאגר הקוד של האתר ב-GitHub</ExternalLink>
          </li>
        </InfoList>
      </InfoSection>

      <InfoSection title="הזמנות">
        <p>
          ההזמנות באתר הן הזמנות הדגמה: אין חיוב ואין משלוח, ולכן אין מה לעקוב אחריו או לבטל. הפרטים
          ב<InfoPageLink id="terms" />.
        </p>
      </InfoSection>

      <InfoSection title="בעיה טכנית או בעיית נגישות">
        <p>
          אפשר לדווח עליה באותן דרכים. מה נבדק מבחינת נגישות, ומה לא, כתוב ב
          <InfoPageLink id="accessibility" />.
        </p>
      </InfoSection>

      <InfoSection title="המידע שלכם">
        <p>
          מה האתר שומר עליכם, ואיך אפשר לפנות בעניין זה, כתוב ב<InfoPageLink id="privacy" />. להמשך
          הגלישה: <InfoLink to={paths.products}>למוצרים</InfoLink>.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
