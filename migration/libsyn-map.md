# Libsyn → Buzzsprout swap map

libsyn is dead (cancelled; redirect never worked). **129 published posts** carry a libsyn embed (123 distinct episode ids). Match each to a Buzzsprout episode by **title + post_date** (libsyn and Buzzsprout ids are unrelated), then the migration swaps the player. Fallback: strip the dead embed, add a text link to the Buzzsprout episode.

| post_date | libsyn_id | slug | title |
|---|---|---|---|
| 2017-06-27 | 5487559 | `ep106` | Finding Your Authentic Self and Why It Matters \| Emotional Fitness is Vastly Underrated |
| 2017-07-11 | 5527756 | `ep107` | Can Boomers Still Launch A Successful Business? \| Entrepreneurship Extends Beyond Millennials |
| 2017-07-28 | 5588421 | `ep108` | Creating a New Niche to Compete with the Titans of Your Industry \| Never Get Discouraged by Big Name Competition |
| 2017-09-29 | 5791396 | `ep109` | Launching a Virtual Summit From Scratch \| Your Cause is More Important than the Size of Your List |
| 2017-10-10 | 5827667 | `ep110` | From Bankrupt to Sexy Boss \| Are You Further Clouding Your Confusion or Strengthening Your Clarity? |
| 2017-11-15 | 5949076 | `ep111` | Asking Your Way to the Top \| Why The Ask Method is Your In-House Market Research Department |
| 2017-11-28 | 5988568 | `ep112` | Creating Generational Wealth \| The Paradigm Shift About Finance That Will Change Your Life |
| 2017-12-07 | 6022759 | `ep113` | Breaking the Mold in Hollywood \| How Technology and a Modern Approach Allowed a 28 Year Old to Make it Big |
| 2018-01-08 | 6128512 | `ep114` | Living What You Preach \| Be a Motivator, Not Just a Motivational Speaker |
| 2018-01-23 | 6181416 | `ep115` | New Year's Resolutions - Part 1: How to Get Your Life Organized \| Not Being Organized is Impacting Your Professional Successes and Your Personal Well-Being |
| 2018-01-25 | 6189494 | `ep116` | Is Network Marketing Right For You? \| Assessing Opportunities with the Right Perspective |
| 2018-02-06 | 6232651 | `ep117` | New Year's Resolutions - Part 2: Make Reading a Habit \| Why it is Essential to Continue Learning Along Your Journey |
| 2018-02-14 | 6260118 | `ep118` | Empowering Employees to Generate the Results You Desire \| The Organization is Always More Than One Person |
| 2018-02-16 | 6268931 | `ep119` | New Year's Resolutions - Part 3: Travel More \| Why Taking Quick Vacations is Imperative to an Early Stage Entrepreneur |
| 2018-02-21 | 6286198 | `ep120` | Changing the Game in Your Industry \| Bucking Traditional Avenues via Technology and Content Creation |
| 2018-03-01 | 6319226 | `is-there-a-best-place-to-build-a-startup` | Is There a Best Place to Build a Startup? \| Slowing Down to Finalize Your Idea Before Running to Market |
| 2018-03-07 | 6340155 | `how-to-start-a-podcast` | How to Start a Podcast Business \| How to Leverage the Podcasting Platform and Create Monetizing Opportunities |
| 2018-03-21 | 6392079 | `how-to-set-goals-in-your-life` | New Year's Resolutions - Part 4: Stop Making Resolutions! \| How to Set Goals in Your Life |
| 2018-03-27 | 6415608 | `management-systems-and-processes` | Why You Need a Management Systems and Processes Mindset to Grow Your Company \| Growth is More Than Just Revenue |
| 2018-04-03 | 6442380 | `spend-more-time-with-family-and-friends` | New Year's Resolutions - Part 5: Spend More Time With Family and Friends \| Why You Need Your Support System |
| 2018-04-18 | 6498149 | `become-a-best-selling-author` | Become a Best Selling Author Without Actually Writing a Book \| Establish Yourself as an Influencer in Your Space |
| 2018-04-19 | 6502097 | `where-should-i-focus-on-my-business` | Where Should I Focus On My Business? \| Growing a Business Successfully is About Framework |
| 2018-04-24 | 6517167 | `food-truck-business` | From a Single Food Truck Business to a Multi-Million Dollar Franchise \| How Two Cousins Launched a Lobster Dynasty |
| 2018-05-03 | 6554482 | `entrepreneur-hobbies` | New Year's Resolutions - Part 6: You Can't Lose Sight of Your Entrepreneur Hobbies \| The Benefit to Disengaging and Coming Back with Fresh Perspective |
| 2018-05-18 | 6572194 | `how-to-raise-money` | How to Raise Money and Compete with Major Corporations \| Leaving a Comfy Job at Google to Cause Disruption |
| 2018-05-18 | 6554482 | `live-an-amazing-life` | New Year's Resolutions - Part 7: How to Save More Money, Spend Less and Live an Amazing Life \| Planning to Succeed in Your Personal Life |
| 2018-05-23 | 6597688 | `reclaim-your-health-naturally` | How to Reclaim Your Health Naturally \| Why Pharmaceutical Drugs Aren't Always the Answer |
| 2018-05-28 | 6627958 | `entrepreneur-burnout` | Recover From Entrepreneur Burnout \| The Man Who Helped Me Get My Life Back |
| 2018-06-06 | 6673420 | `lucid-dreaming` | Is Lucid Dreaming an Entrepreneur Hack? \| Dream Manipulation and Subliminal Truths About Life |
| 2018-06-08 | 6684211 | `live-a-healthy-life` | New Year's Resolutions - Part 8: Lose Weight and Live a Healthy Life \| Health, Happiness and Vitality |
| 2018-06-12 | 6698756 | `learn-how-to-be-more-creative` | Can You Learn How to Be More Creative? \| Continuing The Left Brain, Right Brain Debate |
| 2018-06-18 | 6714848 | `seo-is-still-at-the-core-of-your-marketing-efforts` | Why SEO is Still at the Core of Your Marketing Efforts \| Adopting a More Holistic Approach to Marketing |
| 2018-06-27 | 6724143 | `meditation-and-float-therapy-benefits` | Meditation and Float Therapy Benefits \| Being Intentional About Clarity and Lowering Stress Levels |
| 2018-07-02 | 6739682 | `being-entrepreneurial-in-a-9-to-5` | Being Entrepreneurial in a 9 to 5 \| Viewing Opportunities as Chances to Grow |
| 2018-07-12 | 6796627 | `how-to-focus` | How to Focus on What Matters In Your Business \| Building One Bridge at a Time |
| 2018-07-17 | 6814298 | `going-after-your-dreams-in-life` | Going After Your Dreams in Life \| Sacrificing On Your Ambitions is More Costly Than You May Think |
| 2018-07-20 | 6831687 | `how-to-get-your-small-business-to-compete-with-bigger-companies-today` | How to Get Your Small Business to Compete With Bigger Companies Today \| Leveraging Authority Marketing Strategies |
| 2018-07-23 | 6843946 | `how-to-create-company-culture` | How to Create Company Culture Where People Love to Work \| Employees are People, Not Numbers |
| 2018-08-01 | 6871588 | `when-do-you-need-a-business-coach` | When Do You Need a Business Coach? \| Inside Look at a Coaching Session |
| 2018-08-02 | 6882682 | `when-to-say-no-to-new-opportunities` | When to Say No to New Opportunities \| Keeping Your Thing The Main Thing |
| 2018-08-13 | 6912819 | `how-to-scale-a-service-based-business` | How to Scale a Service Based Business Without Losing Quality \| Evolution of the Technician is Critical |
| 2018-08-16 | 6936276 | `outsourcing` | Outsourcing Basics for Early Stage Entrepreneurs \| You Don't Have to Wear All the Hats Forever |
| 2018-09-12 | 6965645 | `overcome-setbacks` | 10 Tips to Overcome Setbacks in Life \| Life Has Bigger Plans Than You Do |
| 2018-09-12 | 6975596 | `leadership` | My Top 5 Rules for Leadership in a Startup \| The Concept of Balanced Leadership |
| 2018-09-18 | 6994623 | `starting-an-ecommerce-business` | How to Avoid Mistakes Starting an ECommerce Business \| Talking ECommerce with Ezra Firestone |
| 2018-09-18 | 7007134 | `rewiring-your-brain-for-total-transformation` | Rewiring Your Brain for Total Transformation \| The Benefits of Rapid Transformational Therapy |
| 2018-09-18 | 7030141 | `quitting-your-job` | Successfully Quitting Your Job to Start Your Own Business \| And How to Make Money From Day 1 |
| 2018-09-18 | 7061102 | `retail-business` | Is It Possible to Build a Retail Business Without Investment Dollars? \| When Investors Don't Make Sense for Your Company |
| 2018-09-19 | 7066752 | `retirement` | I'm Not Ready for Retirement, What Now? \| The Path of the Modern Elder |
| 2018-09-21 | 7076389 | `self-publishing` | Breaking Down Traditional Publishing Versus Self Publishing a Book \| The Pros and Cons of Writing a Book |
| 2018-09-25 | 7091522 | `leap-of-faith` | Taking a Calculated Leap of Faith \| When Business Aspirations Defy Conventional Wisdom |
| 2018-09-27 | 7100641 | `video-for-business` | A Beginner's Guide on How to Use Video for Business \| Companies Grow 48% Faster When Using Video |
| 2018-10-02 | 7121893 | `women-in-the-workplace` | Reshaping the Way Women in the Workplace are Treated and Viewed \| The Excuse of Oblivion Has Come and Gone |
| 2018-10-04 | 7126559 | `raise-money-for-startup` | When is it Smart to Raise Money for Startup Businesses? \| How Failure Often Leads to Massive Success |
| 2018-10-09 | 7148987 | `online-membership-sites` | What is the Key to Building Successful Online Membership Sites? \| Take Advantage of Recurring Revenue Through the Power of Community |
| 2018-10-11 | 7158009 | `how-to-scale-your-business` | 10 Quick Tips on How to Scale Your Business \| What Got You Here Won't Get You There |
| 2018-10-16 | 7206578 | `failure-is-not-an-option` | What to Do When Failure is Not an Option as an Entrepreneur \| When the Life You've Worked So Hard For Crumbles Around You |
| 2018-10-18 | 7237010 | `business-advantage` | The Business Advantage of Truly Being YOU \| You're Always Second Best at Being Someone Else |
| 2018-10-23 | 7292540 | `take-care-of-your-health` | How to Take Care of Your Health as an Entrepreneur \| Ancient Wisdom and Natural Remedies |
| 2018-10-25 | 7319162 | `top-books-to-read` | My 3 Top Books to Read for Business in 2018 and Beyond \| Reading is an Investment in Your Future |
| 2018-10-30 | 7375895 | `reading-transformed-my-life` | How Reading Transformed My Life \| Reading Isn't a Time Sacrifice, It's an Investment |
| 2018-11-09 | 7505420 | `tech-company` | A Billionaire's Advice to a Tech Company Founder \| How to be Multi-Passionate as an Entrepreneur |
| 2018-11-20 | 7551059 | `engaging-your-employees` | How to Excel at Engaging Your Employees in a More Meaningful Way \| Money is NOT the Primary Motivating Factor |
| 2018-11-20 | 7639421 | `information-products` | How to Sell Information Products on the Internet \| Ryan Deiss of Digital Marketer Drops in to Share His Marketing Expertise |
| 2018-11-27 | 7711877 | `join-a-mastermind-group` | Should You Join a Mastermind Group? \| A Rising Tide Raises All Ships |
| 2018-12-05 | 7817402 | `mental-breakthrough` | How to Achieve Mental Breakthrough in Your Startup \| Applying What's Worked to Other Aspects of Your Life |
| 2019-01-03 | 7898660 | `validate-business-idea` | How to Validate Business Idea or Startup Concept \| Customer Acquisition and Funding Methodologies |
| 2019-01-09 | 8197415 | `facebook-and-instagram-marketing` | Facebook and Instagram Marketing in 2019 (And Beyond) \| Leveraging Social Media for Your Business |
| 2019-01-24 | 8386847 | `how-can-i-make-a-difference-in-the-world` | How Can I Make a Difference in the World as an Entrepreneur? \| Politics and Entrepreneurship |
| 2019-01-29 | 8450045 | `quit-your-day-job` | When to Quit Your Day Job and Pursue Your Entrepreneurial Dreams \| When Money Isn't Enough |
| 2019-02-06 | 8551457 | `biohacking-guide-for-entrepreneurs` | Basic Biohacking Guide for Entrepreneurs \| Dave Asprey's Hacking 411's |
| 2019-02-20 | 8725274 | `podcast-issues` | Podcast Issues with Technology \| How to Record an Amazing Remote Interview |
| 2019-03-05 | 8892488 | `veteran-entrepreneur` | Ideas to Become a Veteran Entrepreneur and How to Make the Transition \| Life After Service |
| 2019-03-07 | 8921963 | `choose-a-business` | How to Choose a Business Idea Using Data \| Getting Customers to Tell You What They Want |
| 2019-03-15 | 9023717 | `pitching-investors` | Pitching Investors and Life Advice with Guy Kawasaki \| Why the Actual Pitch is Overrated |
| 2019-03-22 | 9109832 | `make-money-as-an-entrepreneur` | Is It Too Late to Make Money as an Entrepreneur? \| How Grant Cardone Went From Rehab to $300 Million Net Worth |
| 2019-03-29 | 9197015 | `leadership-rules` | The New Leadership Rules in Your Startup \| Why You're Currently Killing Your Culture |
| 2019-04-03 | 9259691 | `purpose` | Finding Alignment & Purpose as an Entrepreneur \| Never Do Things Just for the Money |
| 2019-04-12 | 9376697 | `make-sales-online` | Make Sales Online with Better Copy |
| 2019-04-17 | 9439517 | `women-entrepreneurs` | Supporting Women Entrepreneurs Through Community \| You Don't Have to "Fit Into a Man's World" |
| 2019-04-25 | 9536531 | `future-entrepreneurs` | What Will the World Look Like for Future Entrepreneurs? \| A Peak Into The Mind of a Silicon Valley Thought Leader |
| 2019-05-10 | 9737210 | `blogging` | Why Blogging is Still the Best Way to Organically Grow Your Business \| Owning Your Traffic |
| 2019-05-31 | 9915734 | `rewire-your-brain` | How to Rewire Your Brain for Business and Personal Growth \| How Rapid Transformation Therapy Works |
| 2019-07-03 | 9957323 | `two-sided-market` | Tips on Growing a Two-Sided Market Business or App \| Marketing & Client Acquisition |
| 2019-07-10 | 10156169 | `social-impact-startups` | Building Social Impact Startups \| How a Police Altercation Led to Innovation |
| 2019-07-18 | 10156169 | `entrepreneur-school` | A Literal Entrepreneur School as Alternative Education \| Formal Education is Evolving Through Innovation |
| 2019-08-13 | 10332317 | `generate-more-revenue` | How to Generate More Revenue Even if You Feel Stuck \| Growing Your Business |
| 2019-08-23 | 10332317 | `ecommerce-business` | How to Start (and Grow) an eCommerce Business \| Taking Affordable Steps |
| 2019-09-05 | 10560236 | `debt` | Managing Debt as a Business Owner \| Avoid Falling Into the Debt Trap |
| 2020-04-14 | 13232654 | `do-you-feel-stuck` | Do You Feel Stuck? Do This! |
| 2020-06-29 | 13894112 | `covid19-business-crisis-management-advice` | Business Crisis Management Advice During Coronavirus (COVID-19) |
| 2020-07-24 | 14205965 | `top-business-tips-mike-michalowicz` | Is Your Business Failing? Top Tips From Mike Michalowicz |
| 2020-08-04 | 14501087 | `lead-generation` | How To Get More Lead Generation \| Tips From Jeff Gothelf |
| 2020-08-04 | 14115821 | `stop-worrying-about-competition` | Small Business Owners, STOP Worrying About COMPETITION! |
| 2020-08-14 | 13618910 | `impact-of-stress` | The Terrifying Impact of Stress on the Body with Dr. Jason McCloskey |
| 2020-08-17 | 15618338 | `neurofeedback-therapy-muse` | Neurofeedback Therapy at Home with the Muse S |
| 2020-08-17 | 14533529 | `one-thing-gary-keller` | Major Takeaways From The One Thing By Gary Keller |
| 2020-08-18 | 14581034 | `create-powerful-habits-mark-green` | How to Create Powerful Habits That Will Change Your Life |
| 2020-08-18 | 14667428 | `top-talent-for-your-business` | Getting Top Talent For Your Business |
| 2020-08-28 | 15482441 | `supporting-black-owned-business-free-thinking` | Supporting Black-Owned Business + Free Thinking with Sterling Brown |
| 2020-08-28 | 15507536 | `keep-your-holistic-health-routines-while-traveling` | How to Keep Your Holistic Health Routines While Traveling |
| 2020-09-01 | 15403214 | `read-faster-and-more-consistently` | How to Read Faster And More Consistently |
| 2020-09-02 | 15691739 | `win-at-any-negotiation` | How to WIN at Any Negotiation |
| 2020-09-03 | 15681974 | `strategic-planning-hacks` | Strategic Planning Hacks With Sean Castrina |
| 2020-09-04 | 15794504 | `projects-done-on-time` | How To Get Projects Done On Time With Clint Padgett |
| 2020-09-05 | 15794540 | `best-microphone-for-podcasting` | Best Microphone For Podcasting? |
| 2020-09-07 | 15601649 | `sales-growth` | Marketing Analytics & Sales Growth with Dr. Denise Gosnell |
| 2020-09-08 | 15302393 | `navigating-a-career-pivot` | Navigating A Career Pivot With Shelley Paxton |
| 2020-09-24 | 16143212 | `the-12-week-year-advice` | The 12 Week Year Advice with Brian Moran |
| 2020-09-28 | 15948971 | `cancel-culture-problems` | The Problem with Cancel Culture with Will Witt |
| 2020-09-28 | 16038773 | `insert-video-in-email-with-bombbomb` | Insert Video in Email with BombBomb w/Ethan Beute |
| 2020-09-30 | 16252361 | `making-podcasting-youtube-and-content-creation-fun` | Making Podcasting, Youtube, and Content Creation FUN with Javier Mercedes |
| 2020-10-07 | 16299974 | `lead-generation-hacks` | Lead Generation Hacks with the Eugene Schwartz UPSYD Model |
| 2020-10-08 | 16329401 | `content-repurposing-strategies` | Content Repurposing Strategies with Shaina Weisinger |
| 2020-10-13 | 16348457 | `emotional-intelligence-and-leadership` | Emotional Intelligence and LEADERSHIP with Mike Robbins |
| 2020-10-15 | 16290164 | `sales-funnels` | The Different Types of Sales Funnels |
| 2020-10-20 | 16054382 | `shure-sm58-review` | Shure SM58 Review |
| 2020-10-23 | 16413062 | `build-an-email-list-fast` | How to Build an Email List FAST |
| 2020-10-30 | 5054053 | `principles-you-must-have-in-business` | The Principles You MUST Have in Business |
| 2020-11-02 | — | `how-to-start-a-podcast-2` | How to Start a Podcast? |
| 2021-04-09 | — | `how-to-start-a-podcast-with-libsyn` | How To Start A Podcast With Libsyn |
| 2022-01-07 | — | `upload-your-podcast-to-apple` | Upload Your Podcast to Apple |
| 2022-09-23 | 24242031 | `top-3-reasons-you-arent-getting-more-clients-and-customers` | Top 3 Reasons You Aren't Getting More Clients and Customers |
| 2022-09-23 | 24399951 | `3-marketing-strategies-you-must-be-doing-in-2022` | 3 Marketing Strategies you MUST be doing in 2022 |
| 2025-09-28 | 38383775 | `navigating-the-social-media-recession` | Navigating the Social Media Recession: Why Instagram Feels Like It's Dying and What to Do About It |
| 2025-09-29 | 38396270 | `social-media-recession-part-2` | Part 2: Are We In a Social Media Recession? |
| 2025-09-30 | 38380135 | `how-to-adapt-to-ai-in-business` | Why I'm Raising the Alarm on AI: Concerns, Containment, and What It Means for Your Business |
| 2025-10-01 | 38424665 | `why-youre-screwing-yourself-by-ignoring-ads` | Why You're Screwing Yourself by Ignoring Ads (And How to Fix It Without Going Bro-Mode) |
| 2025-10-02 | 38440065 | `do-webinars-still-work` | Do Webinars Still Work in 2025? Yes, No, Maybe So – Let's Get Real |
