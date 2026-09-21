'use strict';

/**
 * Master resume - the ONLY source the tailoring step may draw from.
 *
 * Gemini can reorder, select and reword what's here. It cannot add to it:
 * company names, titles, dates and locations are always taken from this file,
 * never from the model, and every rewritten bullet is checked against the
 * original it came from (see _validate.js).
 *
 * Contact details (phone, email) are deliberately NOT in this file - it lives
 * in a git repo. They come from the RESUME_CONTACT env var at render time and
 * are never sent to the model.
 *
 * To update your resume: edit this file and push. Bullet ids must be unique
 * and stable; the model refers to bullets by id.
 */

module.exports = {
  name: 'RAGHAV JHA',
  signOff: 'Raghav Jha',

  // Fallback if RESUME_CONTACT isn't set - no phone number.
  defaultContact: 'Toronto, ON',

  education: {
    school: 'Seneca Polytechnic',
    location: 'Toronto, CA',
    degree: 'Bachelor of Software Engineering Technology',
    gpa: '2.9/4.0',
    graduation: 'Expected Apr 2027',
    coursework: ['Software Engineering', 'Operating Systems', 'Algorithms', 'Artificial Intelligence', 'System Design'],
  },

  experience: [
    {
      id: 'aptosi',
      company: 'Aptosi',
      location: 'Remote',
      title: 'Software Engineering Intern',
      dates: 'Jul 2025 – Present',
      bullets: [
        { id: 'aptosi-1', text: 'Contributed to building a full-stack AI-powered fintech platform from early stage to production, spanning a Chrome extension, React/Next.js dashboard, and backend API.' },
        { id: 'aptosi-2', text: 'Integrated third-party accounting software APIs to enable automated vendor data sync and real-time invoice classification.' },
        { id: 'aptosi-3', text: 'Led security hardening initiatives across multiple repositories, resolving critical and high-severity vulnerabilities to meet compliance standards.' },
        { id: 'aptosi-4', text: 'Refactored the core classification engine from a rule-based approach to an AI-driven architecture, improving detection accuracy and scalability.' },
      ],
    },
    {
      id: 'alpha',
      company: 'Alpha Business Consulting Inc.',
      location: 'Calgary, CA',
      title: 'Web Developer Intern',
      dates: 'Apr 2025 – Dec 2025',
      bullets: [
        { id: 'alpha-1', text: 'Designed and deployed a PDF-to-Excel bank statement processing system that cut manual data-entry time by 70% and significantly improved accuracy.' },
        { id: 'alpha-2', text: 'Contributed to full-stack development of internal tools using React, Node.js, and SQL/NoSQL databases, improving financial and operational workflows.' },
        { id: 'alpha-3', text: 'Coordinated with cross-functional team members to maintain structured task lists, oversee project milestones, and produce technical documentation.' },
      ],
    },
    {
      id: 'codingcloud',
      company: 'Coding Cloud',
      location: 'Ahmedabad, IN',
      title: 'Full Stack Developer Intern',
      dates: 'Oct 2024 – Jan 2025',
      bullets: [
        { id: 'cc-1', text: 'Managed end-to-end communication across five client accounts, clarifying project scopes and setting expectations — resulting in zero delivery delays.' },
        { id: 'cc-2', text: 'Participated in full-stack feature development and contributed to code reviews and sprint planning.' },
      ],
    },
  ],

  projects: [
    {
      id: 'matangi',
      name: 'Matangi Event — Ticket Platform',
      link: 'matangievent.com',
      dates: 'Feb 2025',
      bullets: [
        { id: 'matangi-1', text: 'Co-developed a full-stack ticket-purchasing website that scaled to 1,000+ users, handling live payment transactions end-to-end.' },
        { id: 'matangi-2', text: 'Gained hands-on experience with live transaction flows, UX optimization under real traffic, and production-grade debugging.' },
      ],
    },
    {
      id: 'livestream',
      name: 'Interactive Livestream Platform with Custom Overlays',
      dates: 'Oct 2024',
      bullets: [
        { id: 'livestream-1', text: 'Built a real-time RTSP livestreaming app with React and Flask, featuring draggable/resizable overlays powered by React-RND and a MongoDB-backed CRUD API.' },
      ],
    },
    {
      id: 'cloakscan',
      name: 'CloakScan — Privacy Chrome Extension',
      dates: 'Sep 2024',
      bullets: [
        { id: 'cloakscan-1', text: 'Developed a Chrome extension that detects and blocks third-party trackers, achieving a 95% data-leak prevention rate in testing.' },
      ],
    },
  ],

  skills: [
    { label: 'Languages', items: ['JavaScript', 'TypeScript', 'Python', 'Java', 'PHP', 'C++'] },
    { label: 'Frontend', items: ['React.js', 'Next.js', 'Tailwind CSS', 'Bootstrap', 'HTML/CSS'] },
    { label: 'Backend', items: ['Node.js', 'Express.js', 'FastAPI', 'Flask', 'Spring Boot', 'Laravel', 'GraphQL', 'REST', 'WebSockets', 'Socket.io'] },
    { label: 'Databases', items: ['MongoDB', 'MySQL', 'SQL Server', 'Redis', 'Firebase'] },
    { label: 'Cloud & DevOps', items: ['AWS', 'Google Cloud', 'Docker', 'Kubernetes', 'CI/CD', 'Git'] },
  ],

  activities: [
    {
      id: 'sdc',
      name: 'Seneca Software Developers Club — Executive',
      dates: 'Sep 2024 – Present',
      bullets: [
        { id: 'sdc-1', text: 'Built and maintained the club website, streamlining event registration and communications for a growing developer community.' },
        { id: 'sdc-2', text: 'Organized technical workshops and events, fostering a collaborative environment for student developers.' },
      ],
    },
  ],
};
