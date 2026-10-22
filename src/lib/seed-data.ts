/** Fake prospects. Every name and company here is invented for the demo. */
export const PROSPECTS = [
  {
    name: 'Dana Whitfield',
    title: 'VP of Sales',
    company: 'Northpeak Logistics',
    companySummary:
      'Regional 3PL with ~120 staff serving the Pacific Northwest. Recently opened a second warehouse in Tacoma and is hiring SDRs.',
    linkedinUrl: 'https://www.linkedin.com/in/demo-dana-whitfield',
    ownerName: 'Alex',
  },
  {
    name: 'Marcus Oyelaran',
    title: 'Founder & CEO',
    company: 'Brightline Dental Group',
    companySummary:
      'Owns 6 dental practices in Arizona. Growing by acquisition; the office managers handle marketing on the side.',
    linkedinUrl: 'https://www.linkedin.com/in/demo-marcus-oyelaran',
    ownerName: 'Priya',
  },
  {
    name: 'Elena Castellanos',
    title: 'Head of Growth',
    company: 'Ferrowave Robotics',
    companySummary:
      'Series A hardware startup, 40 people, selling to mid-size manufacturers. Just hired their first two account executives.',
    linkedinUrl: 'https://www.linkedin.com/in/demo-elena-castellanos',
    ownerName: 'Alex',
  },
  {
    name: 'Tom Brandt',
    title: 'Managing Partner',
    company: 'Brandt & Keller CPAs',
    companySummary:
      'Boutique accounting firm with 18 staff. Referral-driven; no outbound motion today. Busy season runs January to April.',
    linkedinUrl: 'https://www.linkedin.com/in/demo-tom-brandt',
    ownerName: 'Priya',
  },
]

/** Canned LinkedIn replies the demo operator can "receive" with one click. */
export const CANNED_REPLIES: { label: string; text: string }[] = [
  {
    label: 'Interested',
    text: "Hey, thanks for reaching out. This is actually timely, we've been talking about outsourcing outbound. Can you send over some info on how your program works and what results look like?",
  },
  {
    label: 'Wants a meeting',
    text: "Yes, let's talk. I'm free Thursday or Friday afternoon this week. Send me a few times and I'll pick one.",
  },
  {
    label: 'Objection: price',
    text: "Appreciate the note. We tried an agency last year and honestly the cost didn't justify the pipeline. Not sure this is different.",
  },
  {
    label: 'Not now',
    text: "Thanks but we're heads-down on a product launch through Q1. Circle back in the spring maybe.",
  },
  {
    label: 'Custom',
    text: '',
  },
]
