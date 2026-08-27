/**
 * The privacy policy and terms, in plain language.
 *
 * WRITTEN TO BE READ, not to be defensible. The brief asks for plain language
 * and no dense legalese, and that is the right call for an app whose users are
 * nurses and students giving up Saturdays, not procurement lawyers. Every
 * paragraph says one thing and says it in the second person.
 *
 * ONE SOURCE, so the policy screen and anything that quotes a line of it
 * (the credential consent block, the check-in explanation) cannot drift apart.
 *
 * EVERY CLAIM HERE MUST BE TRUE OF THE CODE. If a claim below stops matching
 * what the app does, the claim is the bug. The location paragraph in
 * particular is the strongest privacy statement this project can make and it
 * is true today: /api/checkin compares one reading against the venue and keeps
 * the verdict, never the coordinates.
 */

export interface PolicySection {
  heading: string;
  paragraphs: string[];
}

export const PRIVACY_UPDATED = '26 August 2026';

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: 'What V-HUB knows about you',
    paragraphs: [
      'Your name, your email, your phone number if you give one, and where in Ghana you are based. If you are a volunteer, also what you are qualified in, what you can do, and when you are free.',
      'Your phone number and email are never shown to other users. An organisation sees them only once you have applied to one of its outreaches, because at that point it has to be able to reach you.',
    ],
  },
  {
    heading: 'Your location is checked once, and never kept',
    paragraphs: [
      'When you scan the code to check in at an outreach, V-HUB reads your location once, at that moment, and compares it to where the event is being held. The answer it keeps is one word: whether you were at the venue, near it, or somewhere else.',
      'The coordinates themselves are never stored. V-HUB does not build a record of where you have been, does not track you between events, and cannot tell anyone where you were at any time other than the moment you chose to scan.',
      'If you never scan, no location is ever read.',
    ],
  },
  {
    heading: 'Your documents',
    paragraphs: [
      'A credential you upload is stored privately. It is not part of your public profile and cannot be reached by a link. A V-HUB administrator opens it to check that it is genuine, and an organisation can open it only if you have applied to one of its outreaches.',
      'It is used to verify who you are and for nothing else. It is never used for advertising, never sold, and never shared with anyone outside V-HUB.',
      'You can replace it or withdraw it yourself at any time before you are verified, and withdrawing it deletes the file.',
    ],
  },
  {
    heading: 'Your V-Score',
    paragraphs: [
      'Your V-Score is worked out from events you took part in: whether you attended, and how the organisations you volunteered for rated your reliability and, for clinical roles, your clinical work.',
      'Organisations you apply to see your score and your averages. They never see an individual review somebody else wrote, and they never see the private notes an organiser left.',
      'If you think a record about you is wrong, you can dispute it from the Feedback screen. A V-HUB administrator looks at what actually happened and tells both you and the organisation the outcome.',
    ],
  },
  {
    heading: 'Who else is involved',
    paragraphs: [
      'V-HUB stores its data with Supabase, its documents and photos with Cloudinary, and sends email through Resend. Push notifications go through Expo and, on Android, through Google’s messaging service, because Android permits no other way to deliver them.',
      'Skill matching sends the list of skills an outreach asks for and the list you hold to Google’s Gemini so it can spot that two differently-worded skills are the same thing. Your name is not sent, and nothing that identifies you is sent.',
    ],
  },
  {
    heading: 'What you can ask for',
    paragraphs: [
      'You can see and edit everything on your profile from the app. You can withdraw a credential document. You can ask V-HUB to close your account, and closing it removes your profile.',
      'Records of events you actually took part in — that you attended, and reviews written about that work — are kept, because an organisation’s record of who worked at its clinic is its record too, not only yours.',
    ],
  },
];

export const TERMS_SECTIONS: PolicySection[] = [
  {
    heading: 'What V-HUB is',
    paragraphs: [
      'V-HUB introduces health volunteers to organisations running medical outreaches in Ghana. It is an introduction, not an employment agency: V-HUB does not employ you, does not pay you, and is not a party to what you agree with an organisation.',
    ],
  },
  {
    heading: 'What you promise',
    paragraphs: [
      'That what you tell V-HUB about yourself is true — your name, your profession, your qualifications, and any document you upload.',
      'That when you accept a place, you intend to turn up. If you cannot, you withdraw as early as you can so somebody else can take it.',
      'That you work within what you are actually trained and licensed to do, and that you follow the instructions of the organisation running the outreach.',
    ],
  },
  {
    heading: 'What an organisation promises',
    paragraphs: [
      'That it is a real organisation, that its registration details are true, and that the outreach it describes is one it is genuinely running.',
      'That it will not ask a volunteer to work beyond what they are qualified for, and that it takes the ordinary duty of care for people giving their time.',
      'That it reviews volunteers honestly. A review moves a real person’s standing, and one written carelessly is not a neutral act.',
    ],
  },
  {
    heading: 'Verification, and what it means',
    paragraphs: [
      'V-HUB checks that a credential document is real, legible, unexpired and plausibly matches what you say you do. That is the whole of it. It is not a judgement that you are good at your job, and no organisation should treat it as one.',
      'An organisation considering you for a clinical role can look at your document itself and make its own decision. That decision is theirs, not V-HUB’s.',
    ],
  },
  {
    heading: 'When an account is stopped',
    paragraphs: [
      'V-HUB can suspend or close an account that breaks these terms — a false credential, an outreach that does not exist, or treating volunteers or organisers badly.',
      'A suspension stops what has not happened yet. It never rewrites the past: events you attended stay attended, and reviews already written stay written.',
      'You are told the reason. A suspension can be lifted; a closure cannot.',
    ],
  },
  {
    heading: 'What V-HUB is not responsible for',
    paragraphs: [
      'What happens at an outreach is between you and the organisation running it. V-HUB is not present, does not supervise the work, and cannot stand behind it.',
      'V-HUB is a final-year project run on free-tier services. It is offered as it is, and it may be unavailable at times.',
    ],
  },
];
