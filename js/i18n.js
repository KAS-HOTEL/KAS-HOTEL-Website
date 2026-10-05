/* ==========================================================================
   KAS — EN / VI LANGUAGE
   Persistent site-wide language selector and translation layer.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'kas-language';
  var LANG = 'en';
  function readSavedLanguage() {
    /* Explicit URL language wins for the current navigation. This makes every
       header/footer link deterministic. Stored preference is the fallback for
       JS redirects and pages without a lang query. */
    var fromUrl = '';
    try { fromUrl = String(new URLSearchParams(window.location.search).get('lang') || '').toLowerCase(); } catch (e) {}
    if (fromUrl === 'vi' || fromUrl === 'en') return fromUrl;

    var saved = '';
    try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
    if (!saved) {
      try { var m = document.cookie.match(/(?:^|; )kas-language=([^;]+)/); saved = m ? decodeURIComponent(m[1]) : ''; } catch (e) {}
    }
    saved = String(saved).toLowerCase();
    if (saved === 'vi' || saved === 'en') return saved;
    return 'en';
  }
  LANG = readSavedLanguage();
  var originals = new WeakMap();
  var observer = null;
  var applying = false;

  var T = {
    /* header / footer */
    'Destinations':'Điểm đến','Hotels':'Khách sạn','City Guide':'Cẩm nang thành phố','Experiences':'Trải nghiệm','Offers':'Ưu đãi',
    'My KAS':'My KAS','About KAS':'Về KAS','Support':'Hỗ trợ',
    'Sign in / Join':'Đăng nhập / Tham gia','Find your stay':'Tìm nơi lưu trú',
    'Manage booking':'Quản lý đặt phòng','Manage a booking':'Quản lý đặt phòng',
    'Contact & support':'Liên hệ & hỗ trợ','Travel Trade':'Đối tác du lịch',
    'For travel agencies, tour operators and trade enquiries.':'Dành cho đại lý du lịch, công ty lữ hành và các yêu cầu hợp tác.',
    'Chat on Zalo':'Chat trên Zalo','Chat on WhatsApp':'Chat trên WhatsApp',
    'Stay in the know':'Đừng bỏ lỡ thông tin','Exclusive offers and updates, delivered to you.':'Ưu đãi và thông tin mới nhất được gửi đến bạn.',
    'Your email address':'Địa chỉ email của bạn','Subscribe':'Đăng ký',
    'A legacy of Vietnamese hospitality. Distinctive stays in the heart of District 1. One heartfelt promise.':'Di sản của lòng hiếu khách Việt Nam. Những điểm lưu trú khác biệt giữa trung tâm Quận 1. Một lời hứa chân thành.',
    'All properties':'Tất cả khách sạn','District 1':'Quận 1','Ben Thanh':'Bến Thành','Nguyen Thai Binh':'Nguyễn Thái Bình','Le Thanh Ton':'Lê Thánh Tôn',
    'Dining':'Ẩm thực','Rooftop bars':'Quầy bar sân thượng','Rooftop views':'Không gian sân thượng',
    'Wellness & spa':'Chăm sóc sức khỏe & spa','Wellness':'Chăm sóc sức khỏe','Local experiences':'Trải nghiệm địa phương','Airport transfer':'Đưa đón sân bay',
    'FAQ':'Câu hỏi thường gặp','Booking information':'Thông tin đặt phòng','Cancellation policy':'Chính sách hủy phòng','Payment methods':'Phương thức thanh toán','Contact us':'Liên hệ',
    'My bookings':'Đặt phòng của tôi','Member benefits':'Quyền lợi thành viên',
    'Privacy Policy':'Chính sách bảo mật','Terms & Conditions':'Điều khoản & điều kiện',
    'All rights reserved.':'Bảo lưu mọi quyền.','Demo booking platform.':'Nền tảng đặt phòng thử nghiệm.',
    'Call us':'Gọi cho chúng tôi','Quick support':'Hỗ trợ nhanh','Message us':'Nhắn tin cho chúng tôi','Contact KAS':'Liên hệ KAS','Contact us':'Liên hệ',

        'Discover KAS':'Khám phá KAS',
        'Eight distinctive stays across the heart of Ho Chi Minh City.':'Tám điểm lưu trú khác biệt giữa lòng Thành phố Hồ Chí Minh.',
    /* Find Your KAS editorial section */
    'Find Your KAS':'Tìm KAS phù hợp',
    'Choose the way':'Chọn cách',
    'you want to stay.':'bạn muốn lưu trú.',
    'Not every stay needs the same address. Choose the rhythm that matches your trip, then discover the KAS hotel that fits it.':'Mỗi hành trình có một nhịp điệu riêng. Chọn cách lưu trú phù hợp với chuyến đi của bạn, rồi khám phá khách sạn KAS dành cho bạn.',
    'Family trip':'Du lịch cùng gia đình',
    'Central sights, easy movement and a comfortable base for discovering Saigon together.':'Gần các điểm tham quan trung tâm, thuận tiện di chuyển và là điểm nghỉ thoải mái để cùng khám phá Sài Gòn.',
    'Slow traveller':'Du lịch thong thả',
    'Neighbourhood walks, cafés and a more local rhythm.':'Tản bộ trong khu phố, ghé quán cà phê và tận hưởng nhịp sống địa phương.',
    'Business':'Công tác',
    'Connected locations and a comfortable base between meetings.':'Vị trí thuận tiện kết nối và một nơi nghỉ thoải mái giữa những cuộc gặp.',
    'Longer stay':'Lưu trú dài ngày',
    'More space, familiar surroundings and room to settle in.':'Nhiều không gian hơn, môi trường quen thuộc và đủ thoải mái để ở lâu hơn.',
    'Four ways into the KAS collection. Explore the full guide to see how all eight hotels fit different ways of experiencing Saigon.':'Bốn cách để bước vào bộ sưu tập KAS. Khám phá hướng dẫn đầy đủ để xem tám khách sạn phù hợp với những cách trải nghiệm Sài Gòn khác nhau.',
    'Explore your KAS':'Khám phá KAS dành cho bạn',
    /* homepage editorial redesign */
    'Ho Chi Minh City':'Thành phố Hồ Chí Minh',
    'Stay in the heart':'Lưu trú giữa lòng',
    'Stay in the heart of Ho Chi Minh City.':'Lưu trú giữa lòng Thành phố Hồ Chí Minh.',
    'Thoughtfully designed stays in the places that make the city worth discovering.':'Những điểm lưu trú được chăm chút tại những nơi làm nên sức hấp dẫn của thành phố.',
    'Explore our hotels':'Khám phá khách sạn',
    'Find your stay':'Tìm nơi lưu trú',
    'Search':'Tìm kiếm',
    'KAS Hotel Collection':'Bộ sưu tập khách sạn KAS',
    'Your stay,':'Kỳ lưu trú của bạn,',
    'thoughtfully placed.':'được đặt đúng nơi.',
    'KAS Hotel Collection brings together distinctive stays across Ho Chi Minh City — from lively central streets to quieter corners of the city. Each property is designed for an easy, comfortable stay, with the city just outside your door.':'KAS Hotel Collection quy tụ những điểm lưu trú khác biệt khắp Thành phố Hồ Chí Minh — từ những con phố trung tâm sôi động đến những góc phố yên tĩnh hơn. Mỗi khách sạn được thiết kế cho một kỳ lưu trú thoải mái, với thành phố ngay bên ngoài cánh cửa.',
    'Discover KAS':'Khám phá KAS',
    'Places worth staying for.':'Những nơi đáng để lưu trú.',
    'Distinctive properties across the city, each with its own rhythm and character.':'Những khách sạn khác biệt khắp thành phố, mỗi nơi có một nhịp điệu và cá tính riêng.',
    'View all properties':'Xem tất cả khách sạn',
    'Guest prices & photos':'Giá tham khảo & hình ảnh',
    'Location':'Vị trí',
    'A Day in Saigon':'Một ngày ở Sài Gòn',
    'Follow the rhythm':'Theo nhịp sống',
    'of the city.':'của thành phố.',
    'A stay at KAS is not only about where you sleep. It is about the small moments between check-in and check-out.':'Một kỳ lưu trú tại KAS không chỉ là nơi bạn ngủ. Đó còn là những khoảnh khắc nhỏ giữa lúc nhận phòng và trả phòng.',
    'Vietnamese coffee and a quiet morning':'Cà phê Việt Nam và một buổi sáng yên bình',
    'Walk the neighbourhood':'Dạo bước trong khu phố',
    'Local lunch worth remembering':'Bữa trưa địa phương đáng nhớ',
    'Back to KAS, slow down':'Trở về KAS, chậm lại một chút',
    'Golden hour above the city':'Giờ vàng trên thành phố',
    'Saigon after dark':'Sài Gòn khi màn đêm buông xuống',
    'The city,':'Thành phố,',
    'within reach.':'trong tầm tay.',
    "Start the morning with coffee around the corner, walk to the city's landmarks, or return to a quiet room after a day in Ho Chi Minh City. KAS places you close to the neighbourhoods, food, culture and energy that define the city.":'Bắt đầu buổi sáng với một ly cà phê quanh góc phố, đi bộ tới những điểm đến biểu tượng, hoặc trở về căn phòng yên tĩnh sau một ngày ở Thành phố Hồ Chí Minh. KAS đưa bạn đến gần những khu phố, ẩm thực, văn hóa và nhịp sống làm nên thành phố.',
    'Explore Ho Chi Minh City':'Khám phá Thành phố Hồ Chí Minh',
    'Explore our KAS':'Khám phá KAS của chúng tôi',
    'The KAS experience':'Trải nghiệm KAS',
    'The KAS City Guide':'Cẩm nang thành phố KAS',
    'Four neighbourhood stories.':'Bốn câu chuyện khu phố.',
    'Each guide connects KAS hotels with real places nearby. Explore the landmarks, food, culture, shopping and nightlife around the KAS collection.':'Mỗi câu chuyện kết nối các khách sạn KAS với những địa điểm thực tế gần đó. Khám phá điểm tham quan, ẩm thực, văn hóa, mua sắm và nhịp sống về đêm quanh KAS.',
    '01 — The City at Your Doorstep':'01 — Thành phố ngay trước cửa',
    'Start with the city.':'Bắt đầu từ thành phố.',
    'Markets, parks, historic landmarks and the central streets of Saigon.':'Chợ, công viên, những công trình lịch sử và các con phố trung tâm Sài Gòn.',
    '02 — The Taste of Saigon':'02 — Hương vị Sài Gòn',
    'Eat your way through the city.':'Thưởng thức thành phố qua ẩm thực.',
    'Local food, coffee, markets and the streets that give Saigon its flavour.':'Ẩm thực địa phương, cà phê, chợ và những con phố làm nên hương vị Sài Gòn.',
    '03 — The Slow Side':'03 — Một Sài Gòn chậm rãi',
    'Leave room for wandering.':'Để dành chỗ cho những bước lang thang.',
    'Architecture, museums, shopping and quiet streets.':'Kiến trúc, bảo tàng, mua sắm và những con phố yên tĩnh.',
    '04 — Saigon After Dark':'04 — Sài Gòn sau khi trời tối',
    'Stay out a little later.':'Ở ngoài lâu hơn một chút.',
    'Walking streets, evening culture, city views and late-night energy.':'Phố đi bộ, văn hóa buổi tối, góc nhìn thành phố và nhịp sống về đêm.',
    'Explore 10 places →':'Khám phá 10 địa điểm →',
    'Start with the city →':'Bắt đầu từ thành phố →',
    'Taste the city →':'Nếm vị thành phố →',
    'Leave room for wandering →':'Để dành chỗ cho lang thang →',
    'After dark →':'Sau khi trời tối →',

    'Made for the way you travel.':'Dành cho cách bạn khám phá.',
    'Comfort, without complication':'Thoải mái, không cầu kỳ',
    'Thoughtful rooms with the essentials for an easy stay.':'Những căn phòng được chăm chút với đầy đủ điều cần thiết cho một kỳ lưu trú dễ chịu.',
    'Central locations':'Vị trí trung tâm',
    "Stay close to the city's restaurants, landmarks, cafés and everyday life.":'Ở gần nhà hàng, điểm đến, quán cà phê và nhịp sống thường ngày của thành phố.',
    'A place to return to':'Một nơi để trở về',
    'Relaxed interiors and considered spaces after a day in the city.':'Không gian thư thái và tinh tế sau một ngày khám phá thành phố.',
    'For short stays and longer journeys':'Cho kỳ nghỉ ngắn và hành trình dài',
    'Flexible room options for different ways of travelling.':'Lựa chọn phòng linh hoạt cho nhiều cách du lịch khác nhau.',
    'Rooms & Suites':'Phòng & Suite',
    'A room':'Một căn phòng',
    'that feels right.':'đúng với bạn.',
    "From practical city stays to more spacious rooms, discover accommodation designed around comfort, privacy and a good night's rest.":'Từ những kỳ lưu trú tiện lợi trong thành phố đến những căn phòng rộng rãi hơn, khám phá không gian được thiết kế quanh sự thoải mái, riêng tư và một giấc ngủ ngon.',
    'Explore rooms':'Khám phá phòng',
    'Make Ho Chi Minh City':'Hãy để Thành phố Hồ Chí Minh',
    'your next stay.':'là điểm dừng chân tiếp theo.',
    'Discover a KAS property and find your place in the city.':'Khám phá một khách sạn KAS và tìm nơi thuộc về bạn trong thành phố.',
    'Explore our hotels':'Khám phá khách sạn',
    /* homepage heritage */
    'KAS Heritage':'Di sản KAS',
    'Built on heartfelt service.':'Được xây dựng từ sự tận tâm.',
    'From a single boutique house to a growing collection in the heart of Ho Chi Minh City, KAS is dedicated to genuine hospitality, thoughtful details and memorable stays.':'Từ một khách sạn boutique đầu tiên đến bộ sưu tập ngày càng phát triển giữa lòng Thành phố Hồ Chí Minh, KAS theo đuổi lòng hiếu khách chân thành, những chi tiết tinh tế và những kỳ nghỉ đáng nhớ.',
    'Our story':'Câu chuyện của chúng tôi',
    'Properties':'Khách sạn',
    'KAS Hotels':'Khách sạn KAS',
    'One neighbourhood':'Một khu vực trung tâm',
    'Average guest rating':'Điểm đánh giá trung bình',
    'Guest reviews':'Đánh giá của khách',
    'Signature experiences':'Trải nghiệm đặc trưng',
    'Stay well. Eat well. Experience the city.':'Lưu trú thư thái. Ẩm thực tinh tế. Khám phá thành phố.',
    'Vietnamese, international and a Thai kitchen at KAS Sonata.':'Ẩm thực Việt Nam, quốc tế và bếp Thái tại KAS Sonata.',
    'City views and sunsets at Milestone, Ancient and Elegance.':'Ngắm thành phố và hoàng hôn tại Milestone, Ancient và Elegance.',
    'Spa treatments and quiet moments across the KAS collection.':'Liệu trình spa và những phút giây thư thái trong bộ sưu tập KAS.',
    'Ben Thanh, Tao Dan Park and the Museum Quarter on foot.':'Bến Thành, Công viên Tao Đàn và Khu phố Bảo tàng trong khoảng cách đi bộ.',
    'Explore experiences':'Khám phá trải nghiệm',

    /* destinations */
    'Explore Ho Chi Minh City':'Khám phá Thành phố Hồ Chí Minh',
    'Discover the city,':'Khám phá thành phố,',
    'one neighbourhood at a time.':'từng khu phố một.',
    'Start with the destination, then discover the KAS hotels, nearby experiences and places that make each area distinctive.':'Bắt đầu từ điểm đến, sau đó khám phá các khách sạn KAS, trải nghiệm lân cận và những địa điểm tạo nên bản sắc riêng của khu vực.',
    'Explore by destination':'Khám phá theo điểm đến',
    'Places with a sense of place.':'Những nơi mang một bản sắc riêng.',
    'Destination is the starting point. Choose an area first, then move naturally from the neighbourhood to the KAS hotels and nearby experiences within it.':'Điểm đến là nơi câu chuyện bắt đầu. Chọn khu vực trước, sau đó khám phá tự nhiên từ khu phố đến các khách sạn KAS và trải nghiệm lân cận.',
    'Ben Thanh & the Museum Quarter':'Bến Thành & Khu phố Bảo tàng',
    'Markets, heritage streets, museums, cafés and the unmistakable energy of central Saigon.':'Chợ, những con phố di sản, bảo tàng, cà phê và nhịp sống đặc trưng của trung tâm Sài Gòn.',
    'Discover this area →':'Khám phá khu vực →',
    'Tree-lined Saigon':'Sài Gòn rợp bóng cây',
    'Villas, cafés, galleries and quieter streets close to the centre.':'Biệt thự, quán cà phê, phòng tranh và những con phố yên bình gần trung tâm.',
    'Rooftops, River & Nightlife':'Tầng mái, dòng sông & nhịp đêm',
    'Dining, evening energy and landmark city views within easy reach.':'Ẩm thực, không khí buổi tối và những góc nhìn biểu tượng của thành phố trong tầm tay.',
    'Destination · Ben Thanh':'Điểm đến · Bến Thành',
    'Stay in the heart of Ben Thanh.':'Lưu trú giữa lòng Bến Thành.',
    'Based on the supplied KAS address list, all eight current properties are in phường Bến Thành, TP.HCM. The area view therefore connects directly to all eight real hotel detail pages.':'Theo danh sách địa chỉ KAS được cung cấp, cả 8 khách sạn hiện đều thuộc phường Bến Thành, TP.HCM. Vì vậy trang khu vực kết nối trực tiếp tới cả 8 trang chi tiết khách sạn thật.',
    'Nearby':'Lân cận','Walkable':'Đi bộ','Evening':'Buổi tối',
    'Ben Thanh Market':'Chợ Bến Thành',
    'A natural starting point for food, shopping and the rhythm of central Saigon.':'Điểm bắt đầu tự nhiên để khám phá ẩm thực, mua sắm và nhịp sống trung tâm Sài Gòn.',
    'Museum Quarter':'Khu phố Bảo tàng',
    'Museums, heritage buildings and leafy streets within an easy city walk.':'Bảo tàng, công trình di sản và những con phố rợp cây trong khoảng cách đi bộ.',
    'Rooftop & Dining':'Rooftop & Ẩm thực',
    'Discover restaurants, bars and rooftop viewpoints after dark.':'Khám phá nhà hàng, quán bar và những góc nhìn trên cao khi thành phố lên đèn.',
    'KAS Hotel Collection · 8 Properties':'Bộ sưu tập KAS · 8 khách sạn',
    'All KAS Hotels':'Tất cả khách sạn KAS',
    'See the complete collection in one place, or use the address list below to jump directly to a specific property.':'Xem toàn bộ bộ sưu tập tại một nơi hoặc dùng danh sách địa chỉ bên dưới để đi thẳng tới từng khách sạn.',
    'View all hotels':'Xem tất cả khách sạn',
    'View hotel':'Xem khách sạn',

    /* member auth */
    'Create your KAS account':'Tạo tài khoản KAS',
    'Welcome back':'Chào mừng bạn trở lại',
    'Join KAS for member benefits and a smoother booking experience.':'Tham gia KAS để nhận quyền lợi thành viên và trải nghiệm đặt phòng thuận tiện hơn.',
    'Sign in to manage your KAS membership and bookings.':'Đăng nhập để quản lý thành viên và các đặt phòng KAS.',
    'Full name':'Họ và tên',
    'Email *':'Email *',
    'Password *':'Mật khẩu *',
    'Your name':'Họ và tên',
    'you@example.com':'abc@email.com',
    'At least 8 characters':'Tối thiểu 8 ký tự',
    'Remember me on this device':'Ghi nhớ trên thiết bị này',
    'CREATE ACCOUNT':'TẠO TÀI KHOẢN',
    'SIGN IN':'ĐĂNG NHẬP',
    'New to KAS?':'Chưa có tài khoản KAS?',
    'Already a member?':'Đã là thành viên?',
    'Create an account':'Tạo tài khoản',
    'Please enter a valid email address.':'Vui lòng nhập email hợp lệ.',
    'Password must be at least 8 characters.':'Mật khẩu phải có ít nhất 8 ký tự.',
    'Please enter your full name.':'Vui lòng nhập họ và tên.',
    'This email is already registered. Please sign in.':'Email này đã được đăng ký. Vui lòng đăng nhập.',
    'Account created. Welcome to KAS.':'Tạo tài khoản thành công. Chào mừng bạn đến với KAS.',
    'Email or password is incorrect.':'Email hoặc mật khẩu không đúng.',
    'Signed in successfully.':'Đăng nhập thành công.',
    'KAS Rewards':'KAS Rewards',
    'Destination · District 3':'Điểm đến · Quận 3',
    'Tree-lined Saigon, close to the centre.':'Sài Gòn rợp bóng cây, gần trung tâm.',
    'Discover a quieter rhythm through shaded streets, cafés, villas, local food and neighbourhood culture.':'Khám phá một nhịp sống thư thả hơn qua những con phố rợp bóng cây, quán cà phê, biệt thự, ẩm thực địa phương và văn hoá khu phố.',
    'Heritage Villas':'Biệt thự di sản',
    'Explore leafy streets and elegant older architecture away from the busiest central roads.':'Khám phá những con phố xanh và kiến trúc cổ thanh lịch, cách xa các tuyến đường trung tâm đông đúc.',
    'Slow Mornings':'Những buổi sáng thong thả',
    'Find independent cafés and relaxed corners for coffee, breakfast and an unhurried start.':'Tìm những quán cà phê độc lập và góc nhỏ thư giãn cho cà phê, bữa sáng và khởi đầu nhẹ nhàng.',
    'Local Dining':'Ẩm thực địa phương',
    'Move beyond the main tourist routes and discover everyday flavours across the neighbourhood.':'Rời khỏi những tuyến du lịch quen thuộc để khám phá hương vị đời thường của khu phố.',
    'Explore KAS hotels →':'Khám phá khách sạn KAS →',

    /* home */
    'A Legacy of Vietnamese Hospitality':'Di sản của lòng hiếu khách Việt Nam',
    'Timeless Places.':'Những điểm đến vượt thời gian.',
    'Meaningful Stays.':'Những kỳ nghỉ đáng nhớ.',
    'Discover the KAS collection and find your perfect stay in Ho Chi Minh City — distinctive stays, one heartfelt promise.':'Khám phá bộ sưu tập KAS và tìm nơi lưu trú phù hợp tại Thành phố Hồ Chí Minh — những kỳ nghỉ khác biệt, cùng một lời hứa chân thành.',
    'The KAS Collection':'Bộ sưu tập KAS','View all properties':'Xem tất cả khách sạn','Guest price & photos':'Giá & hình ảnh tham khảo',
    'A Legacy of KAS':'Di sản KAS','Built on heartfelt service':'Được xây dựng từ sự tận tâm',
    'From a single boutique house to a growing collection across District 1, KAS has been dedicated to creating genuine moments and lasting memories for every guest.':'Từ một khách sạn boutique đầu tiên đến bộ sưu tập ngày càng mở rộng tại Quận 1, KAS luôn tận tâm tạo nên những khoảnh khắc chân thành và ký ức đáng nhớ cho mỗi vị khách.',
    'Our story':'Câu chuyện của chúng tôi','Signature Experiences':'Trải nghiệm đặc trưng',
    'Rooftop bars, Thai kitchens, spa treatments and the city at your doorstep.':'Quầy bar sân thượng, ẩm thực Thái, các liệu trình spa và thành phố ngay trước cửa.',
    'Explore experiences':'Khám phá trải nghiệm','Guest Stories':'Câu chuyện của khách',
    'Verified reviews from guests across the collection.':'Đánh giá đã xác thực từ khách lưu trú tại các khách sạn trong bộ sưu tập.',
    'Plan your stay':'Lên kế hoạch cho kỳ nghỉ','Book direct for the best rate':'Đặt trực tiếp để nhận mức giá tốt nhất',
    'Search rooms':'Tìm phòng','Best Rate Guarantee':'Cam kết giá tốt nhất','Exclusive Offers':'Ưu đãi độc quyền',
    'Flexible Cancellation':'Hủy linh hoạt','Direct Benefits':'Quyền lợi đặt trực tiếp','Member Privileges':'Quyền lợi thành viên',
    'Featured Property':'Khách sạn nổi bật','Discover now':'Khám phá ngay',
    'Properties':'Khách sạn',
    'KAS Hotels':'Khách sạn KAS','One neighbourhood':'Một khu vực trung tâm','Average guest rating':'Điểm đánh giá trung bình','Guest reviews':'Đánh giá của khách',
    'Local Experiences':'Trải nghiệm địa phương',

    /* search / booking */
    'Where':'Nơi lưu trú','WHERE':'NƠI LƯU TRÚ','Check-in':'Nhận phòng','CHECK-IN':'NHẬN PHÒNG','Check-out':'Trả phòng','CHECK-OUT':'TRẢ PHÒNG',
    'Guests & Rooms':'Khách & phòng','GUESTS & ROOMS':'KHÁCH & PHÒNG','2 Guests, 1 Room':'2 Khách, 1 Phòng',
    'Search Rooms':'Tìm phòng','Clear all':'Xóa tất cả','Apply filters':'Áp dụng bộ lọc','Sort by':'Sắp xếp theo',
    'Recommended':'Đề xuất','Price: low to high':'Giá: thấp đến cao','Price: high to low':'Giá: cao đến thấp','Guest rating':'Đánh giá của khách',
    'Price per night (VND)':'Giá mỗi đêm (VND)','Room type':'Loại phòng','Bed type':'Loại giường','View':'Tầm nhìn','Amenities':'Tiện nghi','Property':'Khách sạn',
    'Private balcony':'Ban công riêng','Bathtub':'Bồn tắm','Breakfast included':'Bao gồm bữa sáng','4-star property':'Khách sạn 4 sao','3-star property':'Khách sạn 3 sao',
    'King bed':'Giường King','Queen bed':'Giường Queen','Twin / single':'Giường Twin / đơn','Double bed':'Giường đôi',
    'City view':'Tầm nhìn thành phố','Street view':'Tầm nhìn đường phố','Has window':'Có cửa sổ','Balcony':'Ban công',
    'Not sure which room is right for you? Our KAS team is here to help you find the perfect stay.':'Chưa chắc phòng nào phù hợp? Đội ngũ KAS sẵn sàng giúp bạn tìm nơi lưu trú phù hợp.',
    'Call us':'Gọi cho chúng tôi',
    'Filters applied.':'Đã áp dụng bộ lọc.','Filters cleared.':'Đã xóa bộ lọc.',
    'No VAT · No service charge · Breakfast not included':'Không VAT · Không phí dịch vụ · Chưa bao gồm bữa sáng',
    'Breakfast included':'Bao gồm bữa sáng','Room only':'Chỉ phòng','Breakfast available on request':'Có thể yêu cầu bữa sáng',
    'Free Wi-Fi':'Wi-Fi miễn phí','Free cancellation until':'Miễn phí hủy đến',
    'Back to home':'Quay lại trang chủ','Back to rooms':'Quay lại danh sách phòng',
    'Book this room':'Đặt phòng này','Your stay':'Kỳ lưu trú của bạn','Edit':'Chỉnh sửa',
    'Room description':'Mô tả phòng','Why guests love this property':'Vì sao khách yêu thích khách sạn này',
    'Room amenities':'Tiện nghi phòng','Room policies':'Chính sách phòng',
    'Previous photo':'Ảnh trước','Next photo':'Ảnh tiếp theo','View all':'Xem tất cả','Image unavailable from source':'Không có hình ảnh từ nguồn',
    'This room type':'Loại phòng này','Another room at this property':'Phòng khác tại khách sạn này',

    /* experiences */
    'KAS Experiences':'Trải nghiệm KAS','Experiences':'Trải nghiệm',
    'Plan your stay around dining, rooftop views, wellness, neighbourhood walks and practical city transfers.':'Lên kế hoạch cho kỳ nghỉ với ẩm thực, không gian sân thượng, chăm sóc sức khỏe, những chuyến dạo bộ trong khu phố và dịch vụ đưa đón thuận tiện.',
    'Discover cafés, restaurants and breakfast options across the collection, with KAS Sonata highlighting Thai dining alongside central-city convenience.':'Khám phá các quán cà phê, nhà hàng và lựa chọn bữa sáng trong bộ sưu tập; KAS Sonata nổi bật với ẩm thực Thái cùng vị trí thuận tiện tại trung tâm thành phố.',
    'Selected properties feature rooftop spaces where guests can enjoy city views and an evening drink.':'Một số khách sạn có không gian sân thượng để du khách ngắm thành phố và thưởng thức đồ uống buổi tối.',
    'Selected KAS addresses offer spa or wellness access. Check the individual property page for the amenities available at your chosen stay.':'Một số khách sạn KAS có dịch vụ spa hoặc chăm sóc sức khỏe. Vui lòng xem trang từng khách sạn để biết các tiện nghi tại nơi lưu trú bạn chọn.',
    'Ben Thanh Market, Tao Dan Park, the museum district, cafés and the central shopping streets are all close to the collection.':'Chợ Bến Thành, Công viên Tao Đàn, khu bảo tàng, các quán cà phê và những tuyến phố mua sắm trung tâm đều nằm gần bộ sưu tập.',
    'Airport pick-up and drop-off are available at selected properties. Contact KAS support before arrival to confirm availability and applicable charges.':'Dịch vụ đón và tiễn sân bay có tại một số khách sạn. Vui lòng liên hệ KAS trước khi đến để xác nhận tình trạng cung cấp và chi phí áp dụng.',
    'Choose a property':'Chọn khách sạn',

    /* offers */
    'KAS Offers':'Ưu đãi KAS','Offers & Member Benefits':'Ưu đãi & Quyền lợi thành viên',
    'Keep your booking simple with direct-booking information, flexible options and member-focused benefits.':'Đơn giản hóa việc đặt phòng với thông tin đặt trực tiếp, các lựa chọn linh hoạt và quyền lợi dành cho thành viên.',
    'Direct booking':'Đặt phòng trực tiếp','Compare KAS reference rates by room type and selected dates, then continue through the direct booking flow.':'So sánh giá tham khảo của KAS theo loại phòng và ngày lưu trú, sau đó tiếp tục quy trình đặt phòng trực tiếp.',
    'Flexible options':'Lựa chọn linh hoạt','Cancellation and payment terms are shown during the booking flow and can vary by room and selected stay dates.':'Điều khoản hủy và thanh toán được hiển thị trong quy trình đặt phòng và có thể thay đổi theo phòng và ngày lưu trú.',
    'My KAS keeps booking management and member-related actions in one place.':'My KAS giúp quản lý đặt phòng và các thao tác dành cho thành viên tại một nơi.',
    'Ready to find your stay?':'Sẵn sàng tìm nơi lưu trú?','Search all properties and compare room types, amenities and reference rates.':'Tìm tất cả khách sạn và so sánh loại phòng, tiện nghi cùng giá tham khảo.',
    'View properties':'Xem các khách sạn',

    /* about */
    'About KAS':'Về KAS','City-centre addresses, one shared approach to thoughtful hospitality and direct, transparent stays.':'Các địa chỉ ngay trung tâm thành phố, cùng một cách tiếp cận tận tâm và trải nghiệm lưu trú trực tiếp, minh bạch.',
    'One collection':'Một bộ sưu tập','KAS brings together distinctive addresses around central Ho Chi Minh City, each with its own character and room mix.':'KAS quy tụ những địa chỉ lưu trú khác biệt quanh trung tâm Thành phố Hồ Chí Minh, mỗi nơi có cá tính và hệ thống phòng riêng.',
    'Human service':'Dịch vụ tận tâm','Our guest promise centres on clear information, responsive support and a comfortable stay from search to checkout.':'Lời hứa với khách của chúng tôi tập trung vào thông tin rõ ràng, hỗ trợ nhanh chóng và trải nghiệm thoải mái từ lúc tìm phòng đến khi trả phòng.',
    'The website presents KAS reference rates, room details, policies and direct support in one place.':'Website cung cấp giá tham khảo, thông tin phòng, chính sách và hỗ trợ trực tiếp của KAS tại một nơi.',
    'Our addresses in the city centre':'Các địa chỉ của chúng tôi tại trung tâm thành phố','Explore the full collection and open any property to see its room inventory, reference rates, photos and booking flow.':'Khám phá toàn bộ bộ sưu tập và mở từng khách sạn để xem danh sách phòng, giá tham khảo, hình ảnh và quy trình đặt phòng.',
    'Explore all properties':'Khám phá tất cả khách sạn',

    /* support */
    'KAS Support':'Hỗ trợ KAS','Support':'Hỗ trợ',
    'Find booking information, cancellation guidance, payment notes and direct contact options for your stay.':'Tìm thông tin đặt phòng, hướng dẫn hủy, lưu ý thanh toán và các kênh liên hệ trực tiếp cho kỳ lưu trú.',
    'Questions about rooms, check-in, amenities or booking? Open the relevant property page first, then contact KAS if you need a property-specific answer.':'Bạn có câu hỏi về phòng, nhận phòng, tiện nghi hoặc đặt phòng? Hãy mở trang khách sạn liên quan trước, sau đó liên hệ KAS nếu cần thông tin cụ thể.',
    'Choose your dates, guests and room, review the reference rate, enter guest details and confirm your booking through the booking flow.':'Chọn ngày, số khách và phòng, kiểm tra giá tham khảo, nhập thông tin khách và xác nhận đặt phòng theo quy trình.',
    'The applicable cancellation deadline and any charge are shown in the room policy section and booking review for the selected stay.':'Thời hạn hủy áp dụng và các khoản phí, nếu có, được hiển thị trong chính sách phòng và phần kiểm tra đặt phòng cho kỳ lưu trú đã chọn.',
    'The current website demo does not take a payment at the time of booking. Payment details can be confirmed with KAS support for your reservation.':'Bản demo website hiện không thực hiện thanh toán tại thời điểm đặt phòng. Thông tin thanh toán có thể được xác nhận với bộ phận hỗ trợ KAS cho đặt phòng của bạn.',
    'For assistance with a reservation, use the phone, Zalo or WhatsApp options in the header and footer.':'Để được hỗ trợ về đặt phòng, hãy sử dụng các lựa chọn điện thoại, Zalo hoặc WhatsApp ở phần đầu trang và chân trang.',

    /* manage booking */
    'My KAS':'My KAS','Manage Your Booking':'Quản lý đặt phòng','Look up your reservation to view, modify or cancel it.':'Tra cứu đặt phòng để xem, chỉnh sửa hoặc hủy.',
    'Booking number':'Mã đặt phòng','Format: KAS + 2-digit branch code + 5 digits.':'Định dạng: KAS + mã chi nhánh 2 chữ số + 5 chữ số.',
    'Email address':'Địa chỉ email','Find my booking':'Tìm đặt phòng',

    /* guest details / review */
    'Guest Details':'Thông tin khách','Please enter your details to continue. We\'ll send your confirmation here.':'Vui lòng nhập thông tin để tiếp tục. Chúng tôi sẽ gửi xác nhận đến đây.',
    'Contact information':'Thông tin liên hệ','Required fields':'Trường bắt buộc','Title':'Danh xưng','Mr':'Ông','Ms':'Bà','Mrs':'Bà','Dr':'TS.',
    'First name':'Tên','Last name':'Họ','Phone number':'Số điện thoại','Create a KAS account for faster booking next time':'Tạo tài khoản KAS để đặt phòng nhanh hơn lần sau',
    'Guest information':'Thông tin khách lưu trú','Check-in guest':'Khách nhận phòng','Same as contact information':'Giống thông tin liên hệ','Different guest':'Khách khác',
    'Guest first name':'Tên khách','Guest last name':'Họ khách','Nationality':'Quốc tịch','Date of birth':'Ngày sinh',
    'Additional requests (optional)':'Yêu cầu thêm (không bắt buộc)','Special requests':'Yêu cầu đặc biệt','Requests are subject to availability and cannot be guaranteed.':'Yêu cầu tùy thuộc tình trạng cung cấp và không được đảm bảo.',
    'Arrival details':'Thông tin đến','Estimated arrival time':'Thời gian đến dự kiến','Purpose of trip':'Mục đích chuyến đi','Leisure':'Nghỉ dưỡng','Business':'Công tác',
    'Family visit':'Thăm gia đình','Event or conference':'Sự kiện hoặc hội nghị','Other':'Khác','How did you hear about us?':'Bạn biết đến chúng tôi từ đâu?',
    'Friend or family':'Bạn bè hoặc gia đình','Social media':'Mạng xã hội','Returning guest':'Khách quay lại','Room guests':'Khách trong phòng',
    'Payment method':'Phương thức thanh toán','This is a demonstration. No payment is processed and no card details are collected or stored.':'Đây là bản demo. Không có thanh toán nào được xử lý và không thu thập hoặc lưu thông tin thẻ.',
    'Continue to review':'Tiếp tục kiểm tra','Price summary':'Tóm tắt giá','Edit':'Chỉnh sửa',
    'Review & Confirm':'Kiểm tra & xác nhận','Please review your booking details before confirming. You won\'t be charged — this is a demo.':'Vui lòng kiểm tra thông tin đặt phòng trước khi xác nhận. Bạn sẽ không bị tính phí — đây là bản demo.',
    'Booking summary':'Tóm tắt đặt phòng','Price breakdown':'Chi tiết giá',
    'Booking Confirmed':'Đặt phòng đã xác nhận',

    /* reference */
    'Guest reference':'Tham khảo cho khách','Home':'Trang chính','Guest reference · No booking':'Tham khảo cho khách · Không đặt phòng',
    'Room rates & photos':'Bảng giá & hình ảnh phòng','Select dates to see the correct seasonal and weekday/weekend rate.':'Chọn ngày để xem đúng mức giá theo mùa và ngày trong tuần/cuối tuần.',
    'This is a public reference page with no booking functionality.':'Đây là trang tham khảo công khai, không có chức năng đặt phòng.',
    'Prices exclude breakfast':'Giá chưa bao gồm ăn sáng','Extra adult: 300,000đ/night':'Người lớn thêm: 300.000đ/đêm','Child 3–12: 150,000đ/night':'Trẻ 3–12 tuổi: 150.000đ/đêm',
    'Check-in date':'Ngày nhận phòng','Check-out date':'Ngày trả phòng','Branch':'Chi nhánh','All branches':'Tất cả chi nhánh','Loading rates...':'Đang tải bảng giá...',
    'Reference rates from the internal rate sheet':'Giá tham khảo theo bảng giá nội bộ đã nhập','No online booking':'Không đặt phòng trực tuyến',

    /* generic room / detail */
    'Hotel facilities':'Tiện nghi khách sạn','Sort by':'Sắp xếp theo','Room size':'Diện tích phòng','Filter rooms':'Lọc phòng',
    'About the property':'Về khách sạn','Room':'Phòng','Why guests love this property':'Vì sao khách yêu thích khách sạn này',
    'Room policies':'Chính sách phòng','Your stay':'Kỳ lưu trú của bạn',
    'Previous':'Trước','Next':'Sau','Close':'Đóng','Cancel':'Hủy','Confirm':'Xác nhận','Save':'Lưu','Continue':'Tiếp tục',
    'Secure your booking':'Bảo đảm đặt phòng của bạn','Select Room':'Chọn phòng','Guest Details':'Thông tin khách','Search':'Tìm kiếm',
    'Dates & guests':'Ngày & số khách','Choose your stay':'Chọn kỳ lưu trú','Add your information':'Thêm thông tin','Review & Confirm':'Kiểm tra & xác nhận',
    'All set!':'Hoàn tất!','Secure your booking':'Đặt phòng an toàn',

    /* listing / booking UI */
    'All KAS Hotels':'Tất cả khách sạn','Ho Chi Minh City':'Thành phố Hồ Chí Minh','Sun':'CN','Mon':'Thứ 2','Tue':'Thứ 3','Wed':'Thứ 4','Thu':'Thứ 5','Fri':'Thứ 6','Sat':'Thứ 7',
    'Modify search':'Chỉnh sửa tìm kiếm','Explore Rooms':'Xem phòng','Done':'Xong','Adults':'Người lớn','Children':'Trẻ em','Rooms':'Phòng','Ages 13+':'Từ 13 tuổi','Ages 2–12':'Từ 2–12 tuổi',
    'FILTER YOUR STAY':'LỌC KỲ LƯU TRÚ','Filter your stay':'Lọc kỳ lưu trú','PRICE PER NIGHT (VND)':'GIÁ MỖI ĐÊM (VND)','Price per night (VND)':'Giá mỗi đêm (VND)',
    'Standard':'Tiêu chuẩn','Superior':'Cao cấp','Deluxe':'Deluxe','Premium':'Premium','Suite & Studio':'Suite & Studio','Family':'Gia đình',
    '8 properties available':'8 khách sạn có sẵn','property available':'khách sạn có sẵn','properties available':'khách sạn có sẵn',
    '2 nights':'2 đêm','1 night':'1 đêm','2 Guests, 1 Room':'2 Khách, 1 Phòng','Recommended':'Đề xuất',
    'Free high-speed Wi-Fi':'Wi-Fi tốc độ cao miễn phí','Rooftop bar':'Quầy bar sân thượng','Restaurant':'Nhà hàng','Cafe':'Cà phê','24-hour front desk':'Lễ tân 24 giờ','+5 more':'+5 tiện nghi khác',
    'Former listing':'Tên đăng trước đây','Property reference':'Thông tin khách sạn','4 room types available':'4 loại phòng có sẵn','room types available':'loại phòng có sẵn','FROM':'TỪ',
    'FIND YOUR BOOKING':'TRA CỨU ĐẶT PHÒNG','Find your booking':'Tra cứu đặt phòng','Booking number':'Mã đặt phòng','Email address':'Địa chỉ email','Find my booking':'Tìm đặt phòng',
    'No bookings are stored in this browser yet. Find a stay →':'Chưa có đặt phòng nào được lưu trên trình duyệt này. Tìm nơi lưu trú →',
    'No bookings are stored in this browser yet.':'Chưa có đặt phòng nào được lưu trên trình duyệt này.','Find a stay':'Tìm nơi lưu trú',
    'Clear all':'Xóa tất cả','Sort by':'Sắp xếp theo','Recommended':'Đề xuất','Search':'Tìm kiếm','Search Rooms':'Tìm phòng','MODIFY SEARCH':'CHỈNH SỬA TÌM KIẾM',
    'About this data':'Về dữ liệu này','No rooms match these filters':'Không có phòng phù hợp với các bộ lọc này','Try widening your price range or clearing a filter.':'Hãy mở rộng khoảng giá hoặc xóa một bộ lọc.',
    'Clear all filters':'Xóa tất cả bộ lọc','Free cancellation':'Miễn phí hủy','Restaurant':'Nhà hàng','Cafe':'Cà phê',

    /* dynamic common */
    'from ':'từ ',' night':' đêm',' nights':' đêm',' reviews':' đánh giá',' review':' đánh giá',
    'guests':'khách','guest':'khách','room':'phòng','rooms':'phòng','per night':'mỗi đêm',
    'No rooms match your filters.':'Không có phòng phù hợp với bộ lọc.','property':'khách sạn','properties':'khách sạn',
    'Image unavailable':'Không có hình ảnh','Photo':'Ảnh','View all':'Xem tất cả',
    'Best for families':'Phù hợp cho gia đình','This room':'Phòng này',
    'No payment is processed':'Không thực hiện thanh toán','Thank you — you are on the list.':'Cảm ơn bạn — bạn đã được thêm vào danh sách.',

    /* hotel listing detail descriptions + card labels */
    'View rooms':'Xem phòng','View Rooms':'Xem phòng','From':'Từ','per night · excl. taxes':'mỗi đêm · chưa gồm thuế','per night':'mỗi đêm',
    'Check-in':'Nhận phòng','Check-out':'Trả phòng','reviews':'đánh giá','more':'thêm','Ben Thanh Ward':'Phường Bến Thành','Nguyen Thai Binh Ward':'Phường Nguyễn Thái Bình',
    'A boutique address in the heart of District 1, minutes from Ben Thanh Market. KAS Passion blends a quiet, relaxing atmosphere with modern, generously sized rooms — a comfortable retreat for…':'Địa chỉ boutique ngay trung tâm Quận 1, chỉ vài phút từ Chợ Bến Thành. KAS Passion kết hợp không gian yên tĩnh, thư giãn với các phòng hiện đại, rộng rãi — một nơi nghỉ ngơi thoải mái cho…',
    "Set in the heart of District 1, a few minutes on foot from the city's most iconic addresses. KAS Premium offers a broad range of rooms suited to couples, families and groups, with…":'Nằm ngay trung tâm Quận 1, chỉ vài phút đi bộ đến những địa điểm nổi tiếng nhất thành phố. KAS Premium có nhiều lựa chọn phòng phù hợp cho cặp đôi, gia đình và nhóm khách, cùng…',
    'A recently renovated boutique address on Nguyen Trai, with a rooftop bar, a ground-floor café and a prime walkable position in District 1. Rooms run from compact city bolt-holes to a 42 m²…':'Địa chỉ boutique vừa được cải tạo trên đường Nguyễn Trãi, có quầy bar sân thượng, quán cà phê tầng trệt và vị trí thuận tiện để đi bộ tại Quận 1. Phòng đa dạng từ không gian thành phố nhỏ gọn đến…',
    "The collection's flagship: a four-star house opened in 2023 with 41 rooms, a rooftop bar over District 1, a fitness centre, an all-day restaurant serving Vietnamese and international menus,…":'Khách sạn chủ lực của bộ sưu tập: khách sạn 4 sao khai trương năm 2023 với 41 phòng, quầy bar sân thượng nhìn ra Quận 1, phòng tập và nhà hàng phục vụ ẩm thực Việt Nam cùng quốc tế cả ngày,…',
    'Nestled in the heart of the city on Le Thanh Ton, with convenience stores, restaurants and cafés a short walk in every direction. Guests single out how quiet the rooms are — a rare thing…':'Nằm giữa trung tâm thành phố trên đường Lê Thánh Tôn, xung quanh là các cửa hàng tiện lợi, nhà hàng và quán cà phê chỉ cách vài phút đi bộ. Du khách đặc biệt yêu thích sự yên tĩnh của phòng — điều hiếm có…',
    'Opened in 2022 on Bui Thi Xuan, with an in-house Thai restaurant, free luggage storage and a room mix that runs from a 15 m² city single up to a 45 m² family suite. Guests repeatedly call…':'Khai trương năm 2022 trên đường Bùi Thị Xuân, có nhà hàng Thái ngay tại khách sạn, giữ hành lý miễn phí và nhiều loại phòng từ phòng đơn thành phố 15 m² đến suite gia đình 45 m². Du khách nhiều lần nhận xét…',
    'A romantic, newly renovated address in the heart of District 1 — modern design, balconies in selected rooms, and a 45 m² Premium Suite. Ben Thanh Market, Independence Palace and Pham Ngu…':'Một địa chỉ lãng mạn vừa được cải tạo tại trung tâm Quận 1 — thiết kế hiện đại, ban công ở một số phòng và Premium Suite rộng 45 m². Chợ Bến Thành, Dinh Độc Lập và Phạm Ngũ…',
    'Elegant yet warm, renovated through 2025, with 40 rooms, a spa, express check-in and a position a single block from Ben Thanh Market. The Premium King adds a 37 m² footprint and a private…':'Thanh lịch nhưng ấm cúng, được cải tạo đến năm 2025, với 40 phòng, spa, nhận phòng nhanh và vị trí chỉ cách Chợ Bến Thành một dãy phố. Premium King có diện tích 37 m² và ban công riêng…',
  };

  /* V17.6 — complete Vietnamese translations for dynamic hotel/room data. */
  Object.assign(T, {
    /* V17.7 — dynamic hotel-detail/review/trust/support strings */
    "Always the best rate when you book direct.": "Luôn có mức giá tốt nhất khi đặt trực tiếp.",
    "Cancel up to 24 hours before check-in.": "Có thể hủy trước 24 giờ so với giờ nhận phòng.",
    "Your payment information is always protected.": "Thông tin thanh toán của bạn luôn được bảo vệ.",
    "Exclusive benefits for KAS Privilege members.": "Quyền lợi độc quyền dành cho thành viên KAS Privilege.",
    "Not sure which room is right for you?": "Chưa chắc phòng nào phù hợp với bạn?",
    "Our KAS team is here to help you find the perfect stay.": "Đội ngũ KAS sẵn sàng giúp bạn tìm nơi lưu trú phù hợp.",
    "CALL US": "GỌI CHO CHÚNG TÔI",
    "CHAT ON ZALO": "CHAT TRÊN ZALO",
    "Location": "Vị trí",
    "Rooms": "Phòng",
    "room": "phòng",
    "Room": "Phòng",
    "Cleanliness": "Sự sạch sẽ",
    "Cleanliness": "Sự sạch sẽ",
    "Service": "Dịch vụ",
    "Value": "Giá trị",
    "Always": "Luôn",
    "Data source": "Nguồn dữ liệu",
    "gallery categories": "nhóm hình ảnh",
    "resolved by filename + address/brand match across the 8-property KAS collection": "được xác định theo tên tệp và đối chiếu địa chỉ/thương hiệu trong bộ sưu tập 8 khách sạn KAS",
    "This property": "Khách sạn này",
    "Pay at hotel, card, ZaloPay or bank transfer.": "Thanh toán tại khách sạn, bằng thẻ, ZaloPay hoặc chuyển khoản ngân hàng.",
    "Bar & lounge": "Bar & lounge",
    "Spa": "Spa",
    "Premium Suite": "Premium Suite",
    "Property names, addresses, room inventory and reference rates are maintained from the KAS dataset and current property references. Guest scores shown in the interface use a clearly labelled 10-point source score (Google or Trip.com, depending on the property). KAS reference rates are not live OTA prices.": "Tên khách sạn, địa chỉ, danh mục phòng và mức giá tham khảo được duy trì theo bộ dữ liệu KAS và thông tin tham chiếu hiện tại của từng khách sạn. Điểm đánh giá của khách hiển thị trên giao diện sử dụng thang điểm 10 từ nguồn được ghi rõ (Google hoặc Trip.com, tùy từng khách sạn). Giá tham khảo của KAS không phải là giá OTA theo thời gian thực.",
  "All properties": "Tất cả khách sạn",
  "Signature Property": "Khách sạn tiêu biểu",
  "Property reference": "Thông tin khách sạn",
  "Save hotel": "Lưu khách sạn",
  "Availability updated.": "Tình trạng phòng đã được cập nhật.",
  "Search": "Tìm kiếm",
  "Search Rooms": "Tìm phòng",
  "No rooms match these filters": "Không có phòng phù hợp với các bộ lọc này",
  "Rooms in property": "Số phòng tại khách sạn",
  "Room types": "Loại phòng",
  "Property rating": "Xếp hạng khách sạn",
  "Guest rating": "Đánh giá của khách",
  "Neighbourhood": "Khu vực",
  "Published rate range": "Khoảng giá công bố",
  "Also listed as": "Còn được đăng với tên",
  "Photos:": "Hình ảnh:",
  "Data:": "Dữ liệu:",
  "room types available": "loại phòng có sẵn",
  "rooms available": "phòng có sẵn",
  "View details": "Xem chi tiết",
  "Select room": "Chọn phòng",
  "Select Room": "Chọn phòng",
  "Breakfast not included": "Không bao gồm bữa sáng",
  "Pay at hotel available": "Có thể thanh toán tại khách sạn",
  "Free cancellation": "Miễn phí hủy",
  "Save": "Lưu",
  "rooms in property": "phòng tại khách sạn",
  "room types": "loại phòng",
  "Not published by source": "Chưa được nguồn công bố",
  "Not published": "Chưa được công bố",
  "Not available from source": "Không có thông tin từ nguồn",
  "No view": "Không có tầm nhìn",
  "Building view": "Tầm nhìn tòa nhà",
  "No window": "Không có cửa sổ",
  "Window": "Cửa sổ",
  "Street view": "Tầm nhìn đường phố",
  "City view": "Tầm nhìn thành phố",
  "Room size": "Diện tích phòng",
  "Bed type": "Loại giường",
  "Max occupancy": "Số khách tối đa",
  "Bathroom": "Phòng tắm",
  "Room amenities": "Tiện nghi phòng",
  "Room policies": "Chính sách phòng",
  "Why guests love this property": "Vì sao khách yêu thích khách sạn này",
  "Your stay": "Kỳ lưu trú của bạn",
  "Edit": "Chỉnh sửa",
  "Book this room": "Đặt phòng này",
  "Back to rooms": "Quay lại danh sách phòng",
  "Home": "Trang chủ",
  "Hotels": "Khách sạn",
  "Guest reviews": "Đánh giá của khách",
  "Verified reviews from": "Đánh giá đã xác thực từ",
  "Based on": "Dựa trên",
  "Stayed": "Đã lưu trú",
  "star": "sao",
  "stars": "sao",
  "Individual review text is not available from source for this property.": "Nguồn không cung cấp nội dung đánh giá riêng lẻ cho khách sạn này.",
  "Photo ID or passport required.": "Yêu cầu giấy tờ tùy thân hoặc hộ chiếu.",
  "Late check-out on request.": "Có thể yêu cầu trả phòng muộn.",
  "After that, 1 night is charged.": "Sau thời điểm đó, tính phí 1 đêm.",
  "All ages welcome": "Chào đón mọi độ tuổi",
  "Extra bed on request, subject to availability.": "Có thể yêu cầu giường phụ, tùy tình trạng phòng.",
  "No payment is taken in this demo.": "Bản demo này không thực hiện thanh toán.",
  "Non-smoking room": "Phòng không hút thuốc",
  "Smoking is not permitted indoors.": "Không được hút thuốc trong phòng.",
  "Cancellation": "Hủy phòng",
  "Children": "Trẻ em",
  "Payment": "Thanh toán",
  "Smoking": "Hút thuốc",
  "Check-in": "Nhận phòng",
  "Check-out": "Trả phòng",
  "per night · excl. taxes": "mỗi đêm · chưa gồm thuế",
  "per night": "mỗi đêm",
  "From": "Từ",
  "more": "thêm",
  "review": "đánh giá",
  "reviews": "đánh giá",
  "guest": "khách",
  "guests": "khách",
  "night": "đêm",
  "nights": "đêm",
  "Free high-speed Wi-Fi": "Wi-Fi tốc độ cao miễn phí",
  "24-hour front desk": "Lễ tân 24 giờ",
  "Airport transportation": "Dịch vụ đưa đón sân bay",
  "Airport pick-up / drop-off": "Đón / tiễn sân bay",
  "Laundry service": "Dịch vụ giặt là",
  "Non-smoking hotel": "Khách sạn không hút thuốc",
  "Non-smoking property": "Khách sạn không hút thuốc",
  "Air conditioning": "Điều hòa",
  "Daily housekeeping": "Dọn phòng hằng ngày",
  "Luggage storage": "Giữ hành lý",
  "Baggage storage": "Giữ hành lý",
  "Elevator": "Thang máy",
  "Rooftop bar": "Quầy bar sân thượng",
  "Restaurant": "Nhà hàng",
  "Cafe": "Cà phê",
  "Dry cleaning": "Giặt khô",
  "Currency exchange": "Đổi ngoại tệ",
  "24-hour security": "An ninh 24 giờ",
  "Concierge": "Dịch vụ concierge",
  "Fitness centre / gym": "Phòng tập thể dục / gym",
  "Free parking": "Đỗ xe miễn phí",
  "Bar & lounge": "Bar & lounge",
  "Afternoon tea": "Trà chiều",
  "Spa": "Spa",
  "On-site parking": "Bãi đỗ xe tại khách sạn",
  "Thai restaurant": "Nhà hàng Thái",
  "Free luggage storage": "Giữ hành lý miễn phí",
  "Breakfast available": "Có phục vụ bữa sáng",
  "Balconies in selected rooms": "Ban công tại một số phòng",
  "Express check-in / check-out": "Nhận / trả phòng nhanh",
  "Ironing service": "Dịch vụ là ủi",
  "CCTV": "Camera giám sát",
  "Queen bed": "Giường Queen",
  "2 Queen beds": "2 giường Queen",
  "2 Single beds": "2 giường đơn",
  "2 Single beds or 1 King bed": "2 giường đơn hoặc 1 giường King",
  "1 Small double + 1 Queen bed": "1 giường đôi nhỏ + 1 giường Queen",
  "1 Small double bed": "1 giường đôi nhỏ",
  "1 Double bed": "1 giường đôi",
  "Double bed": "Giường đôi",
  "King bed": "Giường King",
  "Toilet, sink, stand-up shower": "Bồn cầu, lavabo, vòi sen đứng",
  "Toilet, sink, bathtub": "Bồn cầu, lavabo, bồn tắm",
  "Private bathroom, shower": "Phòng tắm riêng, vòi sen",
  "Private bathroom": "Phòng tắm riêng",
  "Toilet, sink, shower": "Bồn cầu, lavabo, vòi sen",
  "Standard Room": "Phòng Tiêu chuẩn",
  "Superior Room": "Phòng Cao cấp",
  "Family Room": "Phòng Gia đình",
  "Deluxe Room": "Phòng Deluxe",
  "Deluxe Twin Room": "Phòng Deluxe 2 giường đơn",
  "Premium King Room with City View": "Phòng Premium King nhìn ra thành phố",
  "Premium Twin Room with City View": "Phòng Premium Twin nhìn ra thành phố",
  "Family Room with City View": "Phòng Gia đình nhìn ra thành phố",
  "Deluxe Family Room with City View": "Phòng Deluxe Gia đình nhìn ra thành phố",
  "Standard Double Room No Window": "Phòng Standard Double không cửa sổ",
  "Superior Queen Room with City View": "Phòng Superior Queen nhìn ra thành phố",
  "Deluxe King Room with Window": "Phòng Deluxe King có cửa sổ",
  "Deluxe Queen with Window": "Phòng Deluxe Queen có cửa sổ",
  "Premium Queen with Balcony & City View": "Phòng Premium Queen có ban công & tầm nhìn thành phố",
  "Premium Twin with Window": "Phòng Premium Twin có cửa sổ",
  "Junior Suite with Balcony & City View": "Junior Suite có ban công & tầm nhìn thành phố",
  "Superior Queen Room": "Phòng Superior Queen",
  "Deluxe Queen Room with City View": "Phòng Deluxe Queen nhìn ra thành phố",
  "Standard Room No Window": "Phòng Tiêu chuẩn không cửa sổ",
  "Superior Room with Window": "Phòng Superior có cửa sổ",
  "Double Double Room": "Phòng Double Double",
  "Deluxe Double Room Street View": "Phòng Deluxe Double nhìn ra đường phố",
  "Studio Room": "Phòng Studio",
  "Suite Room": "Phòng Suite",
  "Deluxe Double Room with Window": "Phòng Deluxe Double có cửa sổ",
  "Deluxe Balcony Room": "Phòng Deluxe có ban công",
  "Superior Double Room with Window": "Phòng Superior Double có cửa sổ",
  "Standard Double No Window": "Phòng Standard Double không cửa sổ",
  "Deluxe Queen with City View": "Phòng Deluxe Queen nhìn ra thành phố",
  "Premium King with City View": "Phòng Premium King nhìn ra thành phố",
  "Premium Suite": "Premium Suite",
  "Deluxe King Room with Balcony": "Phòng Deluxe King có ban công",
  "Superior Queen Room No Window": "Phòng Superior Queen không cửa sổ",
  "Premium King Room with Balcony": "Phòng Premium King có ban công",
  "Deluxe Queen Room with Balcony": "Phòng Deluxe Queen có ban công",
  "Boutique calm, one block from Ben Thanh.": "Không gian boutique yên tĩnh, chỉ cách Chợ Bến Thành một dãy phố.",
  "Ly Tu Trong elegance, steps from the opera quarter.": "Nét thanh lịch trên đường Lý Tự Trọng, chỉ vài bước đến khu Nhà hát Thành phố.",
  "A rooftop bar above Nguyen Trai.": "Quầy bar sân thượng trên đường Nguyễn Trãi.",
  "The flagship. Rooftop bar, gym, and a 50 m² suite.": "Khách sạn chủ lực. Quầy bar sân thượng, phòng gym và suite 50 m².",
  "Quiet rooms on Le Thanh Ton.": "Phòng nghỉ yên tĩnh trên đường Lê Thánh Tôn.",
  "Thai kitchen downstairs, the comfiest bed in Vietnam upstairs.": "Nhà hàng Thái ở tầng dưới, những chiếc giường êm ái bậc nhất Việt Nam ở tầng trên.",
  "Balconies over Bui Thi Xuan.": "Ban công hướng ra đường Bùi Thị Xuân.",
  "Forty rooms and a spa, a block from Ben Thanh.": "40 phòng và spa, chỉ cách Chợ Bến Thành một dãy phố.",
  "A boutique address in the heart of District 1, minutes from Ben Thanh Market. KAS Passion blends a quiet, relaxing atmosphere with modern, generously sized rooms — a comfortable retreat for travellers who want the centre of Saigon on their doorstep.": "Một địa chỉ boutique ngay trung tâm Quận 1, chỉ vài phút từ Chợ Bến Thành. KAS Passion kết hợp không gian yên tĩnh, thư giãn với các phòng hiện đại, rộng rãi — nơi nghỉ ngơi thoải mái dành cho du khách muốn tận hưởng trung tâm Sài Gòn ngay trước cửa.",
  "Set in the heart of District 1, a few minutes on foot from the city's most iconic addresses. KAS Premium offers a broad range of rooms suited to couples, families and groups, with continental breakfast served daily and a rooftop bar above the street.": "Nằm ngay trung tâm Quận 1, chỉ vài phút đi bộ đến những địa điểm nổi tiếng nhất thành phố. KAS Premium có nhiều lựa chọn phòng phù hợp cho cặp đôi, gia đình và nhóm khách, phục vụ bữa sáng kiểu lục địa hằng ngày cùng quầy bar sân thượng nhìn xuống phố.",
  "A recently renovated boutique address on Nguyen Trai, with a rooftop bar, a ground-floor café and a prime walkable position in District 1. Rooms run from compact city bolt-holes to a 42 m² family layout.": "Một địa chỉ boutique vừa được cải tạo trên đường Nguyễn Trãi, có quầy bar sân thượng, quán cà phê tầng trệt và vị trí thuận tiện để đi bộ tại Quận 1. Phòng đa dạng từ không gian thành phố nhỏ gọn đến bố trí phòng gia đình rộng 42 m².",
  "The collection's flagship: a four-star house opened in 2023 with 41 rooms, a rooftop bar over District 1, a fitness centre, an all-day restaurant serving Vietnamese and international menus, and a breakfast guests write home about.": "Khách sạn chủ lực của bộ sưu tập: khách sạn 4 sao khai trương năm 2023 với 41 phòng, quầy bar sân thượng nhìn ra Quận 1, phòng tập, nhà hàng phục vụ ẩm thực Việt Nam và quốc tế cả ngày, cùng bữa sáng được nhiều du khách đánh giá cao.",
  "Nestled in the heart of the city on Le Thanh Ton, with convenience stores, restaurants and cafés a short walk in every direction. Guests single out how quiet the rooms are — a rare thing this close to the centre.": "Nằm giữa trung tâm thành phố trên đường Lê Thánh Tôn, xung quanh là các cửa hàng tiện lợi, nhà hàng và quán cà phê chỉ cách vài phút đi bộ. Du khách đặc biệt yêu thích sự yên tĩnh của các phòng — điều hiếm có ở vị trí gần trung tâm như vậy.",
  "Opened in 2022 on Bui Thi Xuan, with an in-house Thai restaurant, free luggage storage and a room mix that runs from a 15 m² city single up to a 45 m² family suite. Guests repeatedly call the beds the most comfortable of their trip.": "Khai trương năm 2022 trên đường Bùi Thị Xuân, có nhà hàng Thái ngay tại khách sạn, giữ hành lý miễn phí và nhiều loại phòng từ phòng đơn thành phố 15 m² đến suite gia đình 45 m². Du khách nhiều lần nhận xét những chiếc giường là êm ái nhất trong chuyến đi của họ.",
  "A romantic, newly renovated address in the heart of District 1 — modern design, balconies in selected rooms, and a 45 m² Premium Suite. Ben Thanh Market, Independence Palace and Pham Ngu Lao are all within a few minutes' walk.": "Một địa chỉ lãng mạn vừa được cải tạo tại trung tâm Quận 1 — thiết kế hiện đại, ban công ở một số phòng và Premium Suite rộng 45 m². Chợ Bến Thành, Dinh Độc Lập và Phạm Ngũ Lão đều chỉ cách vài phút đi bộ.",
  "Elegant yet warm, renovated through 2025, with 40 rooms, a spa, express check-in and a position a single block from Ben Thanh Market. The Premium King adds a 37 m² footprint and a private balcony.": "Thanh lịch nhưng ấm cúng, được cải tạo đến năm 2025, với 40 phòng, spa, nhận phòng nhanh và vị trí chỉ cách Chợ Bến Thành một dãy phố. Phòng Premium King có diện tích 37 m² và ban công riêng.",
  "Room size and other physical details were not published in the supplied rate sheet.": "Diện tích phòng và các thông tin vật lý khác chưa được công bố trong bảng giá được cung cấp.",
  "Room size not published by source.": "Diện tích phòng chưa được nguồn công bố.",
  "Ben Thanh Ward": "Phường Bến Thành",
  "Nguyen Thai Binh Ward": "Phường Nguyễn Thái Bình",
  "District 1": "Quận 1",
  "Ho Chi Minh City": "Thành phố Hồ Chí Minh",
  "Saigon": "Sài Gòn",
  "The room is big, the staff friendly and the prices are good, but the location was just perfect!!!!!! In the center!!": "Phòng rộng, nhân viên thân thiện và giá tốt, nhưng vị trí thực sự hoàn hảo!!!!!! Ngay trung tâm!!",
  "Room is clean and quite new, cozy and value for money. Staff here are all friendly and helpful.": "Phòng sạch và khá mới, ấm cúng, đáng tiền. Nhân viên ở đây đều thân thiện và nhiệt tình.",
  "Staff here are all friendly and helpful. Bao Tran and Dat are so friendly and extremely helpful.": "Nhân viên ở đây đều thân thiện và nhiệt tình. Bao Tran và Dat rất thân thiện và hỗ trợ khách tuyệt vời.",
  "Friendly staff, enthusiastic support. Comfortable location, close to many places to eat and visit.": "Nhân viên thân thiện, hỗ trợ nhiệt tình. Vị trí thuận tiện, gần nhiều nơi ăn uống và tham quan.",
  "Friendly and accommodating staff, and a walkable neighbourhood with excellent access to dining and attractions.": "Nhân viên thân thiện, nhiệt tình; khu vực thuận tiện đi bộ và dễ dàng tiếp cận các địa điểm ăn uống, tham quan.",
  "Comfortable. Staff attentive and the location could not be better for walking the centre.": "Thoải mái. Nhân viên chu đáo và vị trí rất thuận tiện để đi bộ khám phá trung tâm.",
  "Great service and prices. Located conveniently in District 1 — breakfast was so good as well!": "Dịch vụ và giá cả rất tốt. Vị trí thuận tiện tại Quận 1 — bữa sáng cũng rất ngon!",
  "The location very strategic. The service very good n friendly. Price very affordable.": "Vị trí rất thuận tiện. Dịch vụ rất tốt và thân thiện. Giá cả rất hợp lý.",
  "Excellent hotel. Friendly staff, great breakfast, comfortable beds and nice decor.": "Khách sạn tuyệt vời. Nhân viên thân thiện, bữa sáng ngon, giường thoải mái và trang trí đẹp.",
  "It was a great experience, Bao Tran was smiley and welcoming. My first reaction when I came in the room was WOW.": "Đó là một trải nghiệm tuyệt vời, Bao Tran luôn tươi cười và chào đón. Phản ứng đầu tiên của tôi khi bước vào phòng là WOW.",
  "The location is excellent, with plenty of convenience stores, restaurants and cafés just a short walk away.": "Vị trí tuyệt vời, có nhiều cửa hàng tiện lợi, nhà hàng và quán cà phê chỉ cách một đoạn đi bộ ngắn.",
  "The room was nice and clean, the bed was comfortable, and the room was very quiet.": "Phòng đẹp và sạch sẽ, giường thoải mái và phòng rất yên tĩnh.",
  "Very welcoming personnel, the location is great. The hotel is next to many beautiful and vibrant streets.": "Nhân viên rất thân thiện và chào đón. Vị trí tuyệt vời. Khách sạn nằm cạnh nhiều con phố đẹp và sôi động.",
  "Easy location, comfortable rooms, and sufficient facilities provided. Good choice for a vacation.": "Vị trí thuận tiện, phòng thoải mái và tiện nghi đầy đủ. Một lựa chọn tốt cho kỳ nghỉ.",
  "Customer service here is exceptional. Spacious room and definitely the comfiest bed I have had in Vietnam.": "Dịch vụ khách hàng ở đây rất tuyệt vời. Phòng rộng rãi và chắc chắn đây là chiếc giường êm ái nhất tôi từng trải nghiệm ở Việt Nam.",
  "Cozy and comfortable room with a huge shower. Value for the money is affordable.": "Phòng ấm cúng, thoải mái với vòi sen rộng. Mức giá rất đáng tiền.",
  "Reception staff were extremely kind, welcoming, and well-informed.": "Nhân viên lễ tân rất tử tế, niềm nở và am hiểu.",
  "Staff were kind and helpful. Beds are firm so if you like that, you will love it!": "Nhân viên tử tế và nhiệt tình. Giường khá chắc, nếu bạn thích kiểu này thì sẽ rất hài lòng!",
  "The staff made me feel like part of a family celebration during my Lunar New Year stay.": "Nhân viên khiến tôi cảm thấy như một phần của gia đình trong kỳ nghỉ Tết Nguyên Đán.",
  "The room was clean, cozy, and comfortable, with welcoming staff and a convenient location near attractions.": "Phòng sạch sẽ, ấm cúng và thoải mái, nhân viên niềm nở và vị trí thuận tiện gần các điểm tham quan.",
  "We were quite pleased with our stay — convenient location and friendly staff.": "Chúng tôi khá hài lòng với kỳ lưu trú — vị trí thuận tiện và nhân viên thân thiện.",
  "Friendly service and good location. Clean, comfortable rooms; staff provided kind, quick assistance.": "Dịch vụ thân thiện và vị trí tốt. Phòng sạch sẽ, thoải mái; nhân viên hỗ trợ nhanh chóng và tận tình.",
  "Unbeatable location near Ben Thanh Market, warm receptionist staff, spacious clean room with fresh linens.": "Vị trí tuyệt vời gần Chợ Bến Thành, nhân viên lễ tân thân thiện, phòng rộng rãi sạch sẽ với ga giường mới.",
  "Great service, great location. Excellent reception staff — especially Ngan — clean room and central position.": "Dịch vụ tuyệt vời, vị trí tuyệt vời. Nhân viên lễ tân rất tốt — đặc biệt là Ngan — phòng sạch và vị trí ngay trung tâm."
} );

  var R = {
    'from ': 'từ ',
    'night': 'đêm',
    'nights': 'đêm',
    'reviews': 'đánh giá',
    'review': 'đánh giá',
    'guests': 'khách',
    'guest': 'khách'
  };

  /* ======================================================================
     V22 — EN/VI consistency pass.
     Entries below only ADD missing translations; existing entries win.
     ====================================================================== */
  (function addMissing(extra) {
    Object.keys(extra).forEach(function (k) { if (!(k in T)) T[k] = extra[k]; });
  })({
    /* header / footer / chrome */
    'Language':'Ngôn ngữ', 'Main':'Điều hướng chính', 'Open menu':'Mở menu', 'Close menu':'Đóng menu',
    'Back to top':'Lên đầu trang', 'Call KAS':'Gọi KAS', 'KAS member':'Thành viên KAS',
    'KAS Hotel Collection — home':'KAS Hotel Collection — trang chủ',
    'Previous properties':'Khách sạn trước', 'Next properties':'Khách sạn tiếp theo',
    'Distinctive stays in the heart of Ho Chi Minh City, created with thoughtful service and memorable experiences.':
      'Những điểm lưu trú khác biệt giữa lòng Thành phố Hồ Chí Minh, được chăm chút với dịch vụ tận tâm và những trải nghiệm đáng nhớ.',
    'More KAS Hotels':'Các khách sạn KAS khác', 'Discover':'Khám phá', 'Meetings & Events':'Hội họp & Sự kiện',
    'Guest Services':'Dịch vụ khách hàng', 'Book a Room':'Đặt phòng', 'Manage Booking':'Quản lý đặt phòng',
    'KAS Member':'Thành viên KAS', 'Special Offers':'Ưu đãi đặc biệt', 'Gift Cards':'Thẻ quà tặng', 'Contact':'Liên hệ',
    'Seasonal offers, new openings, and stories from the KAS collection.':'Ưu đãi theo mùa, khách sạn mới và những câu chuyện từ bộ sưu tập KAS.',
    '© 2026 KAS Hotel Collection. All rights reserved.':'© 2026 KAS Hotel Collection. Bảo lưu mọi quyền.',
    'Terms of Service':'Điều khoản dịch vụ', 'Chat with us':'Trò chuyện với chúng tôi',
    /* home / hotels */
    'KAS Dilly Luxury · garden courtyard':'KAS Dilly Luxury · sân vườn',
    'Find Your Stay':'Tìm nơi lưu trú',
    'Signature hotels in the heart of Ho Chi Minh City.':'Những khách sạn tiêu biểu giữa lòng Thành phố Hồ Chí Minh.',
    'Maximum price per night (VND)':'Giá tối đa mỗi đêm (VND)',
    'Bar & lounge':'Quầy bar & lounge', 'KAS rate · excl. VAT · excl. service charge':'Giá KAS · không VAT · không phí dịch vụ', 'Confirmed':'Đã xác nhận', 'CONFIRMED':'ĐÃ XÁC NHẬN',
    /* hotel / room data vocabulary */
    'Flat-screen TV':'TV màn hình phẳng', 'Mini fridge':'Tủ lạnh mini', 'Electric kettle':'Ấm đun nước điện',
    'Hair dryer':'Máy sấy tóc', 'Safe box':'Két an toàn', 'In-room telephone':'Điện thoại trong phòng',
    'Non-smoking':'Không hút thuốc', 'Rain shower':'Vòi sen phun mưa', 'Bathtub':'Bồn tắm',
    'Private bathroom':'Phòng tắm riêng', 'Air conditioning':'Điều hòa', 'Free Wi-Fi':'Wi-Fi miễn phí',
    '24/7 reception':'Lễ tân 24/7', 'Elevator':'Thang máy', 'Daily housekeeping':'Dọn phòng hằng ngày',
    'Laundry service':'Dịch vụ giặt ủi', 'Airport shuttle':'Đưa đón sân bay', 'Luggage storage':'Giữ hành lý',
    'No window':'Không có cửa sổ', 'Window':'Có cửa sổ', 'Has window':'Có cửa sổ', 'Fixed window':'Cửa sổ cố định',
    'Small window':'Cửa sổ nhỏ', 'May not have a window':'Có thể không có cửa sổ', 'Not published':'Chưa công bố',
    'City view':'Nhìn ra thành phố',
    'Room size and other physical details were not published in the supplied rate sheet.':
      'Diện tích và các thông số khác của phòng chưa được công bố trong bảng giá được cung cấp.',
    'Central District 1 location':'Vị trí trung tâm Quận 1', 'Friendly, attentive team':'Đội ngũ thân thiện, chu đáo',
    'Clean, comfortable rooms':'Phòng sạch sẽ, thoải mái', 'Good value for money':'Đáng giá tiền',
    'Easy walk to Ben Thanh Market':'Dễ dàng đi bộ đến Chợ Bến Thành',
    'Double Or Twin Room':'Phòng Double hoặc Twin', 'Queen Suite-Non-Smoking':'Suite Queen không hút thuốc',
    'Premium Suite Room':'Phòng Premium Suite', 'Studio':'Studio',
    /* booking panels */
    'Your booking':'Đặt phòng của bạn', 'Duration':'Thời gian lưu trú', 'Room rate':'Giá phòng',
    'Service charge (5%)':'Phí dịch vụ (5%)', 'Total':'Tổng cộng', 'Including taxes & fees':'Đã bao gồm thuế & phí',
    'Operator rate sheet':'Bảng giá của khách sạn', 'exclude breakfast':'không bao gồm bữa sáng',
    'Weekday (Mon–Thu) and weekend (Fri–Sun) rates differ and are seasonal. Rates':
      'Giá ngày thường (T2–T5) và cuối tuần (T6–CN) khác nhau và thay đổi theo mùa. Giá',
    'Need help with your booking?':'Cần hỗ trợ đặt phòng?', 'Need help with your reservation?':'Cần hỗ trợ về đặt phòng?',
    'Save for later':'Lưu để xem sau', 'Until 12:00':'Đến 12:00',
    /* guest details */
    'First name is required.':'Vui lòng nhập tên.', 'Last name is required.':'Vui lòng nhập họ.',
    'Email address is required.':'Vui lòng nhập địa chỉ email.', 'Please enter a valid email address.':'Vui lòng nhập địa chỉ email hợp lệ.',
    'Phone number is required.':'Vui lòng nhập số điện thoại.', 'Please enter a valid phone number.':'Vui lòng nhập số điện thoại hợp lệ.',
    'Guest first name is required.':'Vui lòng nhập tên khách lưu trú.', 'Guest last name is required.':'Vui lòng nhập họ khách lưu trú.',
    'Please select a nationality.':'Vui lòng chọn quốc tịch.', 'Please choose a payment method.':'Vui lòng chọn phương thức thanh toán.',
    'Please correct the highlighted fields.':'Vui lòng sửa các trường được đánh dấu.',
    'Please select a check-in date.':'Vui lòng chọn ngày nhận phòng.', 'Please select a check-out date.':'Vui lòng chọn ngày trả phòng.',
    'Check-in date cannot be in the past.':'Ngày nhận phòng không thể ở trong quá khứ.',
    'Check-out must be after check-in.':'Ngày trả phòng phải sau ngày nhận phòng.',
    'At least 1 adult is required.':'Cần ít nhất 1 người lớn.', 'At least 1 room is required.':'Cần ít nhất 1 phòng.',
    'Children cannot be negative.':'Số trẻ em không hợp lệ.',
    'Additional requests':'Yêu cầu thêm', '(optional)':'(không bắt buộc)',
    '· Ages 13+':'· Từ 13 tuổi', '· Ages 2–12':'· 2–12 tuổi', '· Under 2':'· Dưới 2 tuổi', 'Infants':'Em bé',
    'Pay later':'Thanh toán sau', 'Pay at the hotel. No payment needed now.':'Thanh toán tại khách sạn. Không cần thanh toán bây giờ.',
    'Credit / debit card':'Thẻ tín dụng / ghi nợ', 'Secure payment powered by our trusted partners.':'Thanh toán an toàn qua các đối tác tin cậy.',
    'Pay with ZaloPay':'Thanh toán bằng ZaloPay', 'Pay securely with your ZaloPay account.':'Thanh toán an toàn bằng tài khoản ZaloPay.',
    'Bank transfer':'Chuyển khoản ngân hàng', 'Complete your booking and pay by bank transfer.':'Hoàn tất đặt phòng và thanh toán bằng chuyển khoản.',
    'Back to room details':'Quay lại chi tiết phòng', 'Country calling code':'Mã quốc gia',
    'Late check-in, high floor, quiet room, twin beds…':'Nhận phòng muộn, tầng cao, phòng yên tĩnh, hai giường đơn…',
    "I don't know yet":'Chưa biết', 'After 00:00':'Sau 00:00', 'Heard about us':'Biết đến chúng tôi qua',
    /* review / confirmation / manage */
    'Lead guest':'Khách chính', 'Estimated arrival':'Thời gian đến dự kiến', 'Name':'Họ tên', 'Phone':'Điện thoại',
    'Guests':'Khách', 'Guests & rooms':'Khách & phòng', 'Hotel':'Khách sạn', 'Not provided':'Chưa cung cấp',
    'No special requests added.':'Không có yêu cầu đặc biệt.',
    'Special requests are subject to availability and cannot be guaranteed.':'Yêu cầu đặc biệt tùy thuộc tình trạng sẵn có và không được đảm bảo.',
    'Please review your booking details before confirming.':'Vui lòng kiểm tra thông tin đặt phòng trước khi xác nhận.',
    'Review & confirm':'Kiểm tra & xác nhận', 'Room & rate details':'Chi tiết phòng & giá', 'Back to edit':'Quay lại chỉnh sửa',
    'Confirm booking':'Xác nhận đặt phòng', 'Cancellation & important information':'Hủy phòng & thông tin quan trọng',
    'Important information':'Thông tin quan trọng',
    'A valid ID or passport is required at check-in.':'Cần xuất trình giấy tờ tùy thân hoặc hộ chiếu hợp lệ khi nhận phòng.',
    'Taxes and fees are included in the total price shown.':'Thuế và phí đã được bao gồm trong tổng giá hiển thị.',
    'Taxes and fees are included in the total price.':'Thuế và phí đã được bao gồm trong tổng giá.',
    'No payment is processed in this demo.':'Bản demo này không xử lý thanh toán.', 'No payment taken (demo)':'Chưa thu tiền (demo)',
    "You won't be charged — this is a demo.":'Bạn sẽ không bị tính phí — đây là bản demo.',
    'This is a demonstration booking. No payment is taken and no real reservation is created.':'Đây là đặt phòng minh họa. Không thu tiền và không tạo đặt phòng thật.',
    'Demonstration booking — stored only in this browser, no real reservation exists.':'Đặt phòng minh họa — chỉ lưu trên trình duyệt này, không có đặt phòng thật.',
    'Pay later — at the hotel':'Thanh toán sau — tại khách sạn', 'Secured':'Đã bảo mật',
    'Booking confirmed':'Đặt phòng đã xác nhận', 'Thank you, your booking is confirmed!':'Cảm ơn bạn, đặt phòng đã được xác nhận!',
    'Your booking number':'Mã đặt phòng của bạn', 'Booking no.':'Mã đặt phòng', 'Booking details':'Chi tiết đặt phòng', 'Copy':'Sao chép',
    "We've sent the booking confirmation to":'Chúng tôi đã gửi xác nhận đặt phòng đến',
    "We've sent all the details to your inbox.":'Chúng tôi đã gửi toàn bộ thông tin vào hộp thư của bạn.',
    'Check your email':'Kiểm tra email', 'Add to calendar':'Thêm vào lịch', 'Save your stay dates to your calendar.':'Lưu ngày lưu trú vào lịch của bạn.',
    'Apple Calendar (.ics)':'Lịch Apple (.ics)', 'Download confirmation':'Tải xác nhận', 'Print booking':'In đặt phòng',
    "What's next?":'Tiếp theo là gì?', "We're preparing your stay":'Chúng tôi đang chuẩn bị cho kỳ lưu trú của bạn',
    'The team will have everything ready.':'Đội ngũ sẽ chuẩn bị sẵn mọi thứ.', 'See you soon!':'Hẹn sớm gặp bạn!',
    'Manage your booking':'Quản lý đặt phòng', 'View, modify or cancel your booking at any time.':'Xem, thay đổi hoặc hủy đặt phòng bất cứ lúc nào.',
    'Explore more stays':'Khám phá thêm nơi lưu trú', 'Talk to the KAS team':'Trao đổi với đội ngũ KAS', 'KAS guest':'Khách KAS',
    'Bookings saved in this browser':'Đặt phòng đã lưu trên trình duyệt này', 'Find a stay →':'Tìm nơi lưu trú →', 'Find a stay':'Tìm nơi lưu trú',
    /* toasts */
    'Availability updated.':'Đã cập nhật tình trạng phòng.', 'Booking not found.':'Không tìm thấy đặt phòng.',
    'Booking number copied.':'Đã sao chép mã đặt phòng.', 'Booking updated.':'Đã cập nhật đặt phòng.',
    'Calendar file downloaded.':'Đã tải tệp lịch.', 'Confirmation downloaded.':'Đã tải xác nhận.',
    'Filters applied.':'Đã áp dụng bộ lọc.', 'Filters cleared.':'Đã xóa bộ lọc.',
    'Please complete your guest details first.':'Vui lòng hoàn tất thông tin khách trước.',
    'Please select a room to continue.':'Vui lòng chọn phòng để tiếp tục.', 'Search updated.':'Đã cập nhật tìm kiếm.',
    'That room is no longer available.':'Phòng này hiện không còn trống.', 'Your stay has been updated.':'Kỳ lưu trú của bạn đã được cập nhật.'
  });

  var DAY_VI = { Mon:'T2', Tue:'T3', Wed:'T4', Thu:'T5', Fri:'T6', Sat:'T7', Sun:'CN' };
  var BED_VI = { 'small double':'đôi nhỏ', 'double':'đôi', 'single':'đơn', 'queen':'Queen', 'king':'King', 'twin':'Twin' };
  var SUB_VI = { Location:'Vị trí', Cleanliness:'Sạch sẽ', Service:'Dịch vụ', Value:'Đáng giá tiền', Rooms:'Phòng' };
  var TIER_VI = { 'Family':'Gia đình', 'Deluxe Family':'Deluxe Gia đình' };
  var FEAT_VI = { 'with Window':'có cửa sổ', 'No Window':'không cửa sổ', 'Small Window':'cửa sổ nhỏ',
    'with City View':'nhìn ra thành phố', 'with Balcony & City View':'có ban công & tầm nhìn thành phố', 'with Balcony':'có ban công' };
  function bedVI(s) {
    return String(s).replace(/(\d+)\s+(small double|double|single|queen|king|twin)\s+beds?/gi, function (_, n, t) {
      return n + ' giường ' + BED_VI[t.toLowerCase()];
    }).replace(/\s+or\s+/gi, ' hoặc ').replace(/\s+and\s+/gi, ' và ');
  }
  function bathVI(s) {
    return String(s).split(/,\s*/).map(function (x) {
      return ({ 'toilet':'bồn cầu', 'sink':'lavabo', 'stand-up shower':'vòi sen đứng', 'bathtub':'bồn tắm',
        'private bathroom':'phòng tắm riêng', 'shower':'vòi sen' })[x.toLowerCase()] || x;
    }).join(', ');
  }
  function segmentsVI(s) {
    /* Address-like strings ("05 Truong Dinh, Ben Thanh Ward, District 1, Ho Chi Minh City"):
       translate the segments the dictionary knows, keep street names as written. */
    var parts = s.split(', ');
    if (parts.length < 2) return null;
    var known = 0;
    var out = parts.map(function (p) {
      if (T[p] != null && /(?:Ward|City|^District \d+)$/.test(p)) { known++; return T[p]; }
      return /^[0-9A-Za-z–\-\/ ]+$/.test(p) ? p : null;
    });
    return known && out.indexOf(null) < 0 ? out.join(', ') : null;
  }
  /* Whole-string rules: return the finished translation (no further processing). */
  var FULL_RULES = [
    [/^(Standard|Superior|Deluxe|Premium|Family|Deluxe Family)(?: (Double|Queen|King|Twin))? Room(?: (with Window|No Window|Small Window|with City View|with Balcony & City View|with Balcony))?$/,
      function (_, tier, bed, feat) { return 'Phòng ' + (TIER_VI[tier] || tier) + (bed ? ' ' + bed : '') + (feat ? ' ' + FEAT_VI[feat] : ''); }],
    [/^A (?:(.+?) )?room with a (.+?)(?: and a (.+?))?( plus a private balcony)?\.(?: Bathroom: (.+?)\.)?(?: (.+))?$/,
      function (_, size, bed, view, balc, bath, notes) {
        return 'Phòng' + (size ? ' ' + size : '') + ' với ' + bedVI(bed) +
          (view ? ' và ' + (/city view/i.test(view) ? 'tầm nhìn thành phố' : view) : '') +
          (balc ? ', có ban công riêng' : '') + '.' +
          (bath ? ' Phòng tắm: ' + bathVI(bath) + '.' : '') + (notes ? ' ' + translateString(notes) : '');
      }],
    [/^\d+ (?:small double|double|single|queen|king|twin) beds?(?: (?:or|and) \d+ (?:small double|double|single|queen|king|twin) beds?)?$/i, bedVI],
    [/^(Location|Cleanliness|Service|Value|Rooms) — (.+)$/, function (_, k, v) { return SUB_VI[k] + ' — ' + v; }],
    [/^Free until (.+)$/, 'Miễn phí đến $1'],
    [/^Verified reviews from (.+)$/, 'Đánh giá đã xác minh từ $1'],
    [/^(\d) stars?$/, '$1 sao'], [/^(\d)-star$/, '$1 sao'], [/^(\d+) types?$/, '$1 loại'],
    [/^\+(\d+) more$/, '+$1 tiện nghi khác'],
    [/^Photo (\d+)$/, 'Ảnh $1'],
    [/^(Increase|Decrease) (Adults|Children|Infants)$/, function (_, a, b) {
      return (a === 'Increase' ? 'Tăng ' : 'Giảm ') + ({ Adults:'người lớn', Children:'trẻ em', Infants:'em bé' })[b]; }],
    [/^Call KAS on (.+)$/, 'Gọi KAS theo số $1'],
    [/^Our KAS team is here for you (.+)\.$/, 'Đội ngũ KAS luôn sẵn sàng hỗ trợ bạn $1.'],
    [/^Check-in (.+?) · Check-out (.+)$/, 'Nhận phòng $1 · Trả phòng $2'],
    [/^Check-in from (.+?), check-out until (.+?)\.$/, 'Nhận phòng từ $1, trả phòng đến $2.'],
    [/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) · (?:from|từ) (.+)$/, function (_, d, t) { return DAY_VI[d] + ' · từ ' + t; }],
    [/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) · until (.+)$/, function (_, d, t) { return DAY_VI[d] + ' · đến ' + t; }],
    [/^This room type sleeps a maximum of (\d+) guests?(?: and up to (\d+) child(?:ren)?)?\. You have booked (\d+) rooms?\.$/,
      function (_, a, c, r) { return 'Hạng phòng này tối đa ' + a + ' khách' + (c ? ' và tối đa ' + c + ' trẻ em' : '') + '. Bạn đã đặt ' + r + ' phòng.'; }],
    [/^\. Extra adult ([\d.,]+) VND and extra child \(([^)]+)\) ([\d.,]+) VND per person per night above room standard\.$/,
      '. Phụ thu người lớn $1 VND và trẻ em ($2) $3 VND mỗi người mỗi đêm khi vượt tiêu chuẩn phòng.'],
    [/^Cancel for free until (.+?) \(local time\)\. After that, 1 night is charged\.$/, 'Hủy miễn phí đến $1 (giờ địa phương). Sau thời điểm đó, tính phí 1 đêm.'],
    [/^We look forward to welcoming you to (.+)\.$/, 'Chúng tôi mong được đón tiếp bạn tại $1.'],
    [/^A confirmation SMS has also been sent to (.+)\.$/, 'Tin nhắn SMS xác nhận cũng đã được gửi đến $1.'],
    [/^Booked on (.+) · Branch code (\d+)$/, 'Đặt lúc $1 · Mã chi nhánh $2'],
    [/^Quote booking number (\S+) and we will take care of it\.$/, 'Hãy cung cấp mã đặt phòng $1, chúng tôi sẽ hỗ trợ bạn.'],
    [/^Booking (\S+) found\.$/, 'Đã tìm thấy đặt phòng $1.'],
    [/^Booking (\S+) has been cancelled\.$/, 'Đặt phòng $1 đã được hủy.'],
    [/^Booking number: (.+)$/, 'Mã đặt phòng: $1'],
    [/^Call us on (.+)$/, 'Gọi cho chúng tôi theo số $1'],
    [/^Our team replies on Zalo · (.+)$/, 'Đội ngũ của chúng tôi phản hồi qua Zalo · $1'],
    [/^(.+) saved to your list\.$/, function (_, n) { return translateString(n) + ' đã được lưu vào danh sách của bạn.'; }],
    [/^Price · (\d+) nights?$/, 'Giá · $1 đêm'],
    [/^([\d.,]+) VND for (\d+) nights?$/, '$1 VND cho $2 đêm'],
    [/^Max (\d+) guests?$/i, 'Tối đa $1 khách']
  ];
  /* Fragment rules: run before the existing chain of replacements. */
  var CHAIN_RULES = [
    [/\b(\d+)\s+Adults?\b/g, '$1 Người lớn'], [/\b(\d+)\s+Child(?:ren)?\b/g, '$1 Trẻ em'], [/\b(\d+)\s+Infants?\b/g, '$1 Em bé'],
    [/ · Weekday\b/g, ' · Ngày thường'], [/ · Weekend\b/g, ' · Cuối tuần'],
    [/\bservice charge\b/g, 'phí dịch vụ']
  ];
  var MM = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  function datesVI(out) {
    return out
      .replace(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, function(_, y, m, d){ return d + '/' + m + '/' + y; })
      .replace(/\b(0?[1-9]|[12]\d|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2})\b/g, function(_, d, m, y){ return String(d).padStart(2,'0') + '/' + MM[m] + '/' + y; });
  }
  function applyFullRules(core) {
    for (var i = 0; i < FULL_RULES.length; i++) {
      var r = FULL_RULES[i];
      if (r[0].test(core)) { r[0].lastIndex = 0; return core.replace(r[0], r[1]); }
    }
    return segmentsVI(core);
  }

  var memo = new Map();
  function translateString(s) {
    if (!s) return s;
    var hit = memo.get(s);
    if (hit !== undefined) return hit;
    var res = translateStringRaw(s);
    if (memo.size > 5000) memo.clear();
    memo.set(s, res);
    return res;
  }
  function translateStringRaw(s) {
    var lead = (s.match(/^\s*/) || [''])[0], trail = (s.match(/\s*$/) || [''])[0];
    var core = s.slice(lead.length, s.length - trail.length);
    var normalized = core.replace(/\s+/g, ' ').trim();
    if (T[core] != null) return lead + T[core] + trail;
    if (T[normalized] != null) return lead + T[normalized] + trail;
    var full = applyFullRules(normalized);
    if (full != null) return lead + datesVI(full) + trail;
    var out = core;
    CHAIN_RULES.forEach(function (r) { out = out.replace(r[0], r[1]); });
    /* common generated fragments */
    out = out.replace(/\bfrom\s+/gi, 'từ ');
    out = out.replace(/\bBest Rate Guarantee\b/g, 'Cam kết giá tốt nhất');
    out = out.replace(/\bExclusive Offers\b/g, 'Ưu đãi độc quyền');
    out = out.replace(/\bFlexible Cancellation\b/g, 'Hủy linh hoạt');
    out = out.replace(/\bDirect Benefits\b/g, 'Quyền lợi đặt trực tiếp');
    out = out.replace(/\bMember Privileges\b/g, 'Quyền lợi thành viên');
    out = out.replace(/\bFeatured Property\b/g, 'Khách sạn nổi bật');
    out = out.replace(/\bGuest rating\b/g, 'Đánh giá của khách');
    out = out.replace(/\breviews\b/gi, 'đánh giá');
    out = out.replace(/\bproperties available\b/gi, 'khách sạn có sẵn');
    out = out.replace(/\bproperty available\b/gi, 'khách sạn có sẵn');
    out = out.replace(/\broom types available\b/gi, 'loại phòng có sẵn');
    out = out.replace(/\b(\d+)\s+nights?\b/gi, '$1 đêm');
    out = out.replace(/\b(\d+)\s+Guests?\b/gi, '$1 Khách');
    out = out.replace(/\b(\d+)\s+Rooms?\b/gi, '$1 Phòng');
    out = out.replace(/\bAll KAS Hotels\b/g, 'Tất cả khách sạn');
    out = out.replace(/\bHo Chi Minh City\b/g, 'Thành phố Hồ Chí Minh');
    out = out.replace(/\bModify search\b/gi, 'Chỉnh sửa tìm kiếm');
    out = out.replace(/\bFormer listing\b/gi, 'Tên đăng trước đây');
    out = out.replace(/\bProperty reference\b/gi, 'Thông tin khách sạn');
    out = out.replace(/\bStandard\b/g, 'Tiêu chuẩn');
    out = out.replace(/\bSuperior\b/g, 'Cao cấp');
    out = out.replace(/\bFamily\b/g, 'Gia đình');
    out = out.replace(/\bFIND YOUR BOOKING\b/g, 'TRA CỨU ĐẶT PHÒNG');
    out = out.replace(/\bFind your booking\b/g, 'Tra cứu đặt phòng');
    out = out.replace(/\bNo bookings are stored in this browser yet\.\s*Find a stay\s*→?/gi, 'Chưa có đặt phòng nào được lưu trên trình duyệt này. Tìm nơi lưu trú →');
    out = out.replace(/\bProperty rating\b/gi, 'Xếp hạng khách sạn');
    out = out.replace(/\bRooms in property\b/gi, 'Số phòng tại khách sạn');
    out = out.replace(/\bRoom types\b/gi, 'Loại phòng');
    out = out.replace(/\bPublished rate range\b/gi, 'Khoảng giá công bố');
    out = out.replace(/\bNeighbourhood\b/gi, 'Khu vực');
    out = out.replace(/\bSave hotel\b/gi, 'Lưu khách sạn');
    out = out.replace(/\bSignature Property\b/gi, 'Khách sạn tiêu biểu');
    out = out.replace(/\bSelect room\b/gi, 'Chọn phòng');
    out = out.replace(/\bBreakfast not included\b/gi, 'Không bao gồm bữa sáng');
    out = out.replace(/\bPay at hotel available\b/gi, 'Có thể thanh toán tại khách sạn');
    out = out.replace(/\bNo rooms match these filters\b/gi, 'Không có phòng phù hợp với các bộ lọc này');
    out = out.replace(/\bSize not published\b/gi, 'Chưa công bố diện tích');
    out = out.replace(/\bView not published\b/gi, 'Chưa công bố tầm nhìn');
    out = out.replace(/\bMax (\d+) guests?\b/gi, 'Tối đa $1 khách');
    out = out.replace(/\b(\d+) VND for (\d+) nights?\b/gi, '$1 VND cho $2 đêm');
    out = out.replace(/\bKAS reference source\b/gi, 'Nguồn tham khảo KAS');
    out = out.replace(/\bFormer listing\b/gi, 'Tên đăng trước đây');
    out = out.replace(/\bA (\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*m²) room\b/gi, '$1 phòng');
    out = out.replace(/\bA room\b/gi, 'Một phòng');
    out = out.replace(/\bwith a\s+/gi, 'với ');
    out = out.replace(/\band a\s+/gi, 'và ');
    out = out.replace(/\bplus a private balcony\b/gi, 'có thêm ban công riêng');
    out = out.replace(/\bBathroom:\s*toilet, sink, stand-up shower\b/gi, 'Phòng tắm: bồn cầu, lavabo, vòi sen đứng');
    out = out.replace(/\bBathroom:\s*toilet, sink, bathtub\b/gi, 'Phòng tắm: bồn cầu, lavabo, bồn tắm');
    out = out.replace(/\bBathroom:\s*private bathroom, shower\b/gi, 'Phòng tắm: phòng tắm riêng, vòi sen');
    out = out.replace(/\bBathroom:\s*private bathroom\b/gi, 'Phòng tắm: phòng tắm riêng');
    out = out.replace(/\bBathroom:\s*toilet, sink, shower\b/gi, 'Phòng tắm: bồn cầu, lavabo, vòi sen');
    out = out.replace(/\bFree Cancellation\b/g, 'Miễn phí hủy');
    out = out.replace(/\bSecure Payment\b/g, 'Thanh toán an toàn');
    out = out.replace(/\bExclusive Benefits\b/g, 'Quyền lợi độc quyền');
    out = out.replace(/\bDirect Benefits\b/g, 'Quyền lợi đặt trực tiếp');
    out = out.replace(/\bProperty reference\b/gi, 'Thông tin khách sạn');
    out = out.replace(/\bAlso listed as\b/gi, 'Còn được đăng với tên');
    out = out.replace(/\bPhotos:\s*/gi, 'Hình ảnh: ');
    out = out.replace(/\bData:\s*/gi, 'Dữ liệu: ');
    out = out.replace(/\bProperty names, addresses, room inventory and reference rates are maintained from the KAS dataset and current property references\.\s*Guest scores shown in the interface use a clearly labelled 10-point source score \(Google or Trip\.com, depending on the property\)\.\s*KAS reference rates are not live OTA prices\./gi, 'Tên khách sạn, địa chỉ, danh mục phòng và mức giá tham khảo được duy trì theo bộ dữ liệu KAS và thông tin tham chiếu hiện tại của từng khách sạn. Điểm đánh giá của khách hiển thị trên giao diện sử dụng thang điểm 10 từ nguồn được ghi rõ (Google hoặc Trip.com, tùy từng khách sạn). Giá tham khảo của KAS không phải là giá OTA theo thời gian thực.');
    out = out.replace(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, function(_, y, m, d){ return d + '/' + m + '/' + y; });
    out = out.replace(/\b(0?[1-9]|[12]\d|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2})\b/g, function(_, d, m, y){ var mm={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'}; return String(d).padStart(2,'0') + '/' + mm[m] + '/' + y; });
    out = out.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2})\b/g, function(_, m, y){ var vi={Jan:'Tháng 1',Feb:'Tháng 2',Mar:'Tháng 3',Apr:'Tháng 4',May:'Tháng 5',Jun:'Tháng 6',Jul:'Tháng 7',Aug:'Tháng 8',Sep:'Tháng 9',Oct:'Tháng 10',Nov:'Tháng 11',Dec:'Tháng 12'}; return vi[m] + '/' + y; });
    out = out.replace(/\bStayed\s+/gi, 'Đã lưu trú ');
    out = out.replace(/\bBased on\s+/gi, 'Dựa trên ');
    out = out.replace(/\bguest reviews\b/gi, 'đánh giá của khách');
    out = out.replace(/\bFree cancellation until\b/gi, 'Miễn phí hủy đến');
    out = out.replace(/\bBreakfast included\b/g, 'Bao gồm bữa sáng');
    out = out.replace(/\bBreakfast not included\b/g, 'Không bao gồm bữa sáng');
    out = out.replace(/\bPay at hotel available\b/g, 'Có thể thanh toán tại khách sạn');
    out = out.replace(/\bView rooms\b/g, 'Xem phòng');
    out = out.replace(/\bView details\b/g, 'Xem chi tiết');
    out = out.replace(/\bMost popular\b/g, 'Phổ biến nhất');
    out = out.replace(/\bGreat for couples\b/g, 'Phù hợp cho cặp đôi');
    out = out.replace(/\bBest for families\b/g, 'Phù hợp cho gia đình');
    return lead + out + trail;
  }

  function isExcluded(node) {
    var p = node.parentElement;
    if (!p) return true;
    return !!p.closest('script,style,noscript,textarea,[data-i18n-ignore]');
  }

  function applyText(lang) {
    if (lang !== 'vi') {
      /* Restore text nodes whose original English was recorded. */
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var n = walker.currentNode;
        var o = originals.get(n);
        if (o != null && !isExcluded(n)) n.nodeValue = o;
      }
      restoreAttrs();
      return;
    }
    var walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker2.nextNode()) nodes.push(walker2.currentNode);
    nodes.forEach(function(n) {
      if (isExcluded(n)) return;
      var o = originals.get(n);
      if (o == null) { o = n.nodeValue; originals.set(n, o); }
      var tr = translateString(o);
      if (tr !== n.nodeValue) n.nodeValue = tr;
    });
    translateAttrs();
  }

  var ATTRS = ['placeholder','aria-label','title','alt'];
  var ATTR_SEL = 'input,textarea,button,a,[title],[aria-label],img';
  function attrTargets(root) {
    var list = Array.prototype.slice.call((root || document).querySelectorAll(ATTR_SEL));
    if (root && root.matches && root.matches(ATTR_SEL)) list.unshift(root);
    return list;
  }
  function translateAttrs(root) {
    attrTargets(root).forEach(function(el) {
      ATTRS.forEach(function(a) {
        if (!el.hasAttribute(a)) return;
        var val = el.getAttribute(a), key = 'kas-i18n-' + a;
        var original = el.getAttribute(key);
        if (original == null) { original = val; el.setAttribute(key, original); }
        el.setAttribute(a, translateString(original));
      });
    });
  }
  function restoreAttrs() {
    document.querySelectorAll('input,textarea,button,a,[title],[aria-label],img').forEach(function(el) {
      ATTRS.forEach(function(a) {
        var key = 'kas-i18n-' + a, original = el.getAttribute(key);
        if (original != null) el.setAttribute(a, original);
      });
    });
  }

  function persistLanguageLinks(root) {
    var links = Array.prototype.slice.call((root || document).querySelectorAll('a[href]'));
    if (root && root.matches && root.matches('a[href]')) links.unshift(root);
    links.forEach(function (a) {
      if (!a.getAttribute('data-kas-lang-base')) a.setAttribute('data-kas-lang-base', a.getAttribute('href'));
      var base = a.getAttribute('data-kas-lang-base');
      if (!base || /^(?:#|mailto:|tel:|javascript:)/i.test(base)) return;
      var u;
      try { u = new URL(base, window.location.href); } catch (e) { return; }
      if (u.origin !== window.location.origin) return;
      if (LANG === 'vi') u.searchParams.set('lang', 'vi');
      else u.searchParams.delete('lang');
      a.setAttribute('href', u.pathname + (u.search ? u.search : '') + (u.hash ? u.hash : ''));
    });
  }



  /* Homepage hero title uses deliberate editorial line breaks. Keeping the
     line structure here avoids CSS width hacks and keeps EN/VI deterministic. */
  var HERO_TITLE_LINES = {
    en: ['Stay in the', 'heart of', 'Ho Chi Minh', 'City.'],
    vi: ['Lưu trú', 'giữa lòng', 'Thành phố', 'Hồ Chí Minh.']
  };
  function applyHeroTitle() {
    var el = document.querySelector('[data-hero-title]');
    if (!el) return;
    var lines = HERO_TITLE_LINES[LANG] || HERO_TITLE_LINES.en;
    el.textContent = '';
    lines.forEach(function(line, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
  }

  function apply() {
    applying = true;
    if (observer) observer.disconnect();
    document.documentElement.lang = LANG;
    applyHeroTitle();
    applyText(LANG);
    var titleMap = {
      'KAS Hotel Collection — Timeless Places. Meaningful Stays.':'KAS Hotel Collection — Những điểm đến vượt thời gian. Những kỳ nghỉ đáng nhớ.',
      'Find Your Stay — KAS Hotel Collection':'Tìm nơi lưu trú — KAS Hotel Collection',
      'Hotel — KAS Hotel Collection':'Khách sạn — KAS Hotel Collection',
      'Experiences — KAS Hotel Collection':'Trải nghiệm — KAS Hotel Collection',
      'Offers & Member Benefits — KAS Hotel Collection':'Ưu đãi & Quyền lợi thành viên — KAS Hotel Collection',
      'About KAS — KAS Hotel Collection':'Về KAS — KAS Hotel Collection',
      'Support — KAS Hotel Collection':'Hỗ trợ — KAS Hotel Collection',
      'Manage Your Booking — KAS Hotel Collection':'Quản lý đặt phòng — KAS Hotel Collection',
      'Guest Details — KAS Hotel Collection':'Thông tin khách — KAS Hotel Collection',
      'Review & Confirm — KAS Hotel Collection':'Kiểm tra & xác nhận — KAS Hotel Collection',
      'Booking Confirmed — KAS Hotel Collection':'Đặt phòng đã xác nhận — KAS Hotel Collection',
      'Room — KAS Hotel Collection':'Phòng — KAS Hotel Collection',
      'Destinations — KAS Hotel Collection':'Điểm đến — KAS Hotel Collection',
      'KAS Hotel Collection — Stay in the heart of Ho Chi Minh City.':'KAS Hotel Collection — Lưu trú giữa lòng Thành phố Hồ Chí Minh.',
};
    applyTitle(titleMap);
    persistLanguageLinks();
    applying = false;
    observe();
  }
  var TITLE_MAP = null;
  function applyTitle(titleMap) {
    titleMap = titleMap || TITLE_MAP;
    if (!titleMap) return;
    TITLE_MAP = titleMap;
    var title = document.title;
    if (LANG === 'vi') {
      if (title === document.__kasTitleVi) return;   /* already translated: keep it stable */
      /* remember the page's own English title so EN can restore it later */
      document.__kasTitleEn = title;
      document.title = titleMap[title] || translateString(title);
      document.__kasTitleVi = document.title;
    }
    else {
      var found = Object.keys(titleMap).find(function(k){ return titleMap[k] === title; });
      if (found) document.title = found;
      else if (document.__kasTitleEn && title === document.__kasTitleVi) document.title = document.__kasTitleEn;
    }
  }

  function translateTextNode(n) {
    if (isExcluded(n)) return;
    var prev = originals.get(n);
    /* A node that was moved (not new) is already translated: keep its original. */
    if (prev != null && translateString(prev) === n.nodeValue) return;
    var o = n.nodeValue;
    originals.set(n, o);
    var tr = translateString(o);
    if (tr !== o) n.nodeValue = tr;
  }
  function translateSubtree(root) {
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
    while (walker.nextNode()) list.push(walker.currentNode);
    list.forEach(translateTextNode);
    translateAttrs(root);
  }
  function onAttributeChange(el, a) {
    var key = 'kas-i18n-' + a, stored = el.getAttribute(key), val = el.getAttribute(a);
    if (val == null) return;
    if (LANG !== 'vi') { if (stored != null) el.setAttribute(key, val); return; }
    if (stored != null && val === translateString(stored)) return;   /* our own write */
    el.setAttribute(key, val);
    el.setAttribute(a, translateString(val));
  }
  /* Handle DOM changes incrementally. Previously every mutation re-walked and
     re-translated the entire page (and re-wrote every link), which made each
     carousel/gallery/toast update cost a full-document pass. */
  function processMutations(records) {
    if (applying) return;
    observer.disconnect();
    try {
      records.forEach(function (r) {
        if (r.type === 'attributes') { onAttributeChange(r.target, r.attributeName); return; }
        r.addedNodes.forEach(function (node) {
          if (!node.isConnected) return;
          if (LANG === 'vi') translateSubtree(node);
          if (node.nodeType === 1) persistLanguageLinks(node);
        });
      });
      applyTitle();
    } finally {
      connect();
    }
  }
  function connect() {
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:ATTRS});
  }
  function observe() {
    if (observer) observer.disconnect();
    observer = observer || new MutationObserver(processMutations);
    connect();
  }

  function syncLanguagePicker() {
    var select = document.querySelector('.lang-select');
    if (select) select.value = LANG;
    document.querySelectorAll('.lang-wrap--custom').forEach(function(wrap){
      var flag = wrap.querySelector('.lang-current-flag');
      var code = wrap.querySelector('.lang-current-code');
      var opts = wrap.querySelectorAll('.lang-option');
      var isVi = LANG === 'vi';
      if (flag) flag.innerHTML = (global.flagIcon ? global.flagIcon(LANG) : (isVi ? '🇻🇳' : '🇬🇧'));
      if (code) code.textContent = isVi ? 'VI' : 'EN';
      opts.forEach(function(opt){
        var active = opt.getAttribute('data-lang') === LANG;
        opt.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    });
  }

  function setLanguage(lang) {
    LANG = String(lang).toLowerCase() === 'vi' ? 'vi' : 'en';
    try { localStorage.setItem(KEY, LANG); } catch (e) {}
    try { document.cookie = 'kas-language=' + encodeURIComponent(LANG) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (e) {}
    try {
      var cur = new URL(window.location.href);
      if (cur.searchParams.has('lang') || LANG === 'vi') {
        if (LANG === 'vi') cur.searchParams.set('lang', 'vi'); else cur.searchParams.delete('lang');
        history.replaceState(history.state, '', cur.pathname + cur.search + cur.hash);
      }
    } catch (e) {}
    apply();
    syncLanguagePicker();
    document.dispatchEvent(new CustomEvent('kas:language', {detail:{lang:LANG}}));
  }

  function bindLanguageNavigation() {
    if (document.__kasLangNavBound) return;
    document.__kasLangNavBound = true;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var base = a.getAttribute('href');
      if (!base || /^(?:#|mailto:|tel:|javascript:)/i.test(base)) return;
      var u;
      try { u = new URL(base, window.location.href); } catch (err) { return; }
      if (u.origin !== window.location.origin) return;
      if (LANG === 'vi') u.searchParams.set('lang', 'vi');
      else u.searchParams.delete('lang');
      a.setAttribute('href', u.pathname + (u.search ? u.search : '') + (u.hash ? u.hash : ''));
    }, true);
  }

  function init() {
    /* Header is rendered by App.boot; wire the dropdown after it exists. */
    LANG = readSavedLanguage();
    bindLanguageNavigation();
    var select = document.querySelector('.lang-select');
    if (select) {
      select.value = LANG;
      if (!select.__kasI18nBound) {
        select.__kasI18nBound = true;
        select.addEventListener('change', function(){ setLanguage(this.value); });
      }
    }
    syncLanguagePicker();
    try { localStorage.setItem(KEY, LANG); } catch (e) {}
    try { document.cookie = 'kas-language=' + encodeURIComponent(LANG) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (e) {}
    apply();
  }

  function withLang(url) {
    var u;
    try { u = new URL(url, window.location.href); } catch (e) { return url; }
    if (u.origin !== window.location.origin) return url;
    if (LANG === 'vi') u.searchParams.set('lang', 'vi');
    else u.searchParams.delete('lang');
    return u.pathname + (u.search ? u.search : '') + (u.hash ? u.hash : '');
  }

  global.KAS_I18N = {
    init:init, apply:apply, setLanguage:setLanguage, withLang:withLang,
    getLanguage:function(){return LANG;},
    /* Language-aware: returns the English source unchanged while EN is active. */
    t:function(s){ return LANG === 'vi' ? translateString(s) : s; }
  };
})(window);
