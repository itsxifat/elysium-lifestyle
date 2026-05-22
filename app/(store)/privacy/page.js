export const metadata = {
  title: "Privacy Policy — Elysium Lifestyle",
  description: "Elysium Lifestyle's privacy policy — how we collect, use, and protect your information.",
};

const LAST_UPDATED = "1 May 2025";

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="bg-brand-cream border-b border-brand-tan/15 py-14">
        <div className="container-custom">
          <p className="text-brand-tan text-[10px] uppercase tracking-[3px] mb-3">Legal</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-brand-brown mb-3">Privacy Policy</h1>
          <p className="text-brand-tan text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="container-custom py-14">
        <div className="max-w-3xl prose prose-sm prose-stone">
          <div className="space-y-10 text-brand-brown/80 text-[14px] leading-relaxed">

            <section>
              <p className="text-brand-brown/60">
                At Elysium Lifestyle, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or make a purchase. Please read this policy carefully.
              </p>
            </section>

            <LegalSection title="1. Information We Collect">
              <p>We collect information you provide directly to us when you:</p>
              <ul>
                <li>Create an account or place an order</li>
                <li>Subscribe to our newsletter</li>
                <li>Contact us for customer support</li>
              </ul>
              <p>This information may include your name, email address, phone number, billing and shipping address, and payment information.</p>
              <p>We also automatically collect certain technical information when you use our site, including your IP address, browser type, device information, pages visited, and referring URLs.</p>
            </LegalSection>

            <LegalSection title="2. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul>
                <li>Process and fulfil your orders, including sending order confirmations and shipping updates</li>
                <li>Create and manage your account</li>
                <li>Send promotional communications (with your consent)</li>
                <li>Improve our website, products, and customer experience</li>
                <li>Prevent fraud and ensure the security of our services</li>
                <li>Comply with legal obligations</li>
              </ul>
            </LegalSection>

            <LegalSection title="3. Sharing Your Information">
              <p>We do not sell, trade, or rent your personal information to third parties. We may share your information only with:</p>
              <ul>
                <li><strong>Payment processors</strong> (SSLCommerz, bKash) to securely process your transactions</li>
                <li><strong>Delivery partners</strong> who fulfil your orders</li>
                <li><strong>Email service providers</strong> for transactional emails</li>
                <li><strong>Legal authorities</strong> when required by law</li>
              </ul>
              <p>All third-party service providers are contractually required to protect your information.</p>
            </LegalSection>

            <LegalSection title="4. Payment Security">
              <p>
                All payment transactions are processed through secure, PCI-DSS compliant payment gateways. We do not store your full credit card details on our servers. Payments via bKash or card are processed entirely by SSLCommerz, our payment gateway partner.
              </p>
            </LegalSection>

            <LegalSection title="5. Cookies">
              <p>We use cookies and similar tracking technologies to improve your browsing experience. These include:</p>
              <ul>
                <li><strong>Essential cookies</strong> — required for the website to function (cart, session)</li>
                <li><strong>Analytics cookies</strong> — help us understand how visitors use our site</li>
              </ul>
              <p>You can control cookie settings through your browser preferences. Disabling cookies may affect certain features of the website.</p>
            </LegalSection>

            <LegalSection title="6. Data Retention">
              <p>
                We retain your personal information for as long as necessary to fulfil the purposes outlined in this policy, including legal, accounting, or reporting requirements. Order records are typically retained for up to 7 years for tax and compliance purposes.
              </p>
            </LegalSection>

            <LegalSection title="7. Your Rights">
              <p>You have the right to:</p>
              <ul>
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your account and associated data</li>
                <li>Opt out of marketing communications at any time</li>
              </ul>
              <p>To exercise these rights, please contact us at hello@elysiumlifestyle.com.</p>
            </LegalSection>

            <LegalSection title="8. Children's Privacy">
              <p>
                Our website is not directed at children under the age of 13. We do not knowingly collect personal information from children. If you believe we have inadvertently collected such information, please contact us immediately.
              </p>
            </LegalSection>

            <LegalSection title="9. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page with an updated date. Continued use of our website after changes constitutes acceptance of the updated policy.
              </p>
            </LegalSection>

            <LegalSection title="10. Contact Us">
              <p>If you have any questions about this Privacy Policy or how we handle your data, please contact us:</p>
              <ul>
                <li>Email: hello@elysiumlifestyle.com</li>
                <li>Phone: +880 1700-000000</li>
                <li>Address: Dhaka, Bangladesh</li>
              </ul>
            </LegalSection>

          </div>
        </div>
      </div>
    </div>
  );
}

function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-brand-brown mb-4 pb-2 border-b border-brand-tan/15">{title}</h2>
      <div className="space-y-3 text-brand-brown/70 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-brand-brown [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}
