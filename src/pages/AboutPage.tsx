import { paths } from '@/app/paths'
import {
  ExternalLink,
  InfoLink,
  InfoList,
  InfoPage,
  InfoPageLink,
  InfoSection,
} from '@/components/shared/InfoPage'
import { GITHUB_REPOSITORY_URL } from '@/lib/links'

export function AboutPage() {
  return (
    <InfoPage
      id="about"
      intro={
        <>
          <span dir="ltr">N.M.S</span> היא חנות הדגמה לרכיבי מחשב: מעבדים, כרטיסי מסך, לוחות אם,
          מסכים ועוד. האתר נבנה כפרויקט תוכנה, כדי להראות חנות מקוונת שלמה שעובדת מקצה לקצה.
        </>
      }
    >
      <InfoSection title="מה זה האתר">
        <p>
          זהו אתר הדגמה ולא עסק פעיל. אפשר לעיין בקטלוג, לחפש, לשמור מועדפים, ליצור חשבון ולבצע
          הזמנת הדגמה. לא מתבצע חיוב, לא נשלח מוצר ולא נשלח אימייל.
        </p>
      </InfoSection>

      <InfoSection title="מה אפשר לעשות באתר">
        <InfoList>
          <li>
            לעיין ב<InfoLink to={paths.products}>מוצרים</InfoLink> לפי קטגוריה, לחפש ולסנן לפי מותג
            ומפרט, ולמיין לפי מחיר או שם.
          </li>
          <li>לשמור מוצרים במועדפים. המועדפים נשמרים בדפדפן שלכם.</li>
          <li>
            להוסיף מוצרים לעגלה. אחרי הרשמה והתחברות העגלה נשמרת בחשבון, ומחכה לכם גם במכשיר אחר.
          </li>
          <li>
            להירשם ולהתחבר לחשבון אמיתי, לבצע הזמנת הדגמה ולראות אותה אחר כך ברשימת ההזמנות שלכם.
          </li>
        </InfoList>
      </InfoSection>

      <InfoSection title="איך האתר בנוי">
        <p>
          צד הלקוח נכתב ב-React וב-TypeScript ומתארח ב-GitHub Pages. צד השרת הוא API שנכתב ב-Node.js
          וב-Express ומתארח ב-Render, והנתונים נשמרים ב-MongoDB Atlas. הקוד פתוח, והתיעוד כולל תיאור
          של הארכיטקטורה, בקוד המקור ב-
          <ExternalLink href={GITHUB_REPOSITORY_URL}>GitHub</ExternalLink>.
        </p>
        <p>
          השרת רץ בתוכנית חינמית שנרדמת כשאין בה שימוש, ולכן הכניסה הראשונה אחרי הפסקה יכולה לקחת
          כמעט דקה עד שהמוצרים נטענים.
        </p>
      </InfoSection>

      <InfoSection title="תוכן הקטלוג">
        <p>
          שמות המוצרים, המותגים, הלוגואים והתמונות שייכים ליצרנים, ומוצגים כאן רק כתוכן של חנות
          הדגמה. מכיוון שאין באתר רכישה אמיתית, המחירים והמפרטים הם תוכן הדגמה ואינם הצעה למכירה.
        </p>
      </InfoSection>

      <InfoSection title="עוד באתר">
        <p>
          <InfoPageLink id="contact" />, <InfoPageLink id="terms" />, <InfoPageLink id="privacy" />{' '}
          ו<InfoPageLink id="accessibility" />.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
