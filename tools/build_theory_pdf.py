from pathlib import Path
import json, html
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'data/theory-week2.json').read_text(encoding='utf-8'))
OUT=ROOT/'pdfs/theory/WEEK_2_REVISION_GUIDE.pdf'; OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('Study','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('StudyBold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Study',normal='Study',bold='StudyBold',italic='Study',boldItalic='StudyBold')
NAVY=HexColor('#152f49');TEAL=HexColor('#148777');INK=HexColor('#30495e');MUTED=HexColor('#657b8b');PALE=HexColor('#eef7f4');LINE=HexColor('#dce7ea')
styles={
 'title':ParagraphStyle('title',fontName='StudyBold',fontSize=29,leading=33,textColor=NAVY,spaceAfter=14),
 'h1':ParagraphStyle('h1',fontName='StudyBold',fontSize=22,leading=27,textColor=NAVY,spaceAfter=16),
 'h2':ParagraphStyle('h2',fontName='StudyBold',fontSize=12.5,leading=17,textColor=TEAL,spaceBefore=13,spaceAfter=7),
 'body':ParagraphStyle('body',fontName='Study',fontSize=10,leading=15,textColor=INK,spaceAfter=8),
 'small':ParagraphStyle('small',fontName='Study',fontSize=8.7,leading=12,textColor=MUTED,spaceAfter=5),
 'table':ParagraphStyle('table',fontName='Study',fontSize=9,leading=12.5,textColor=INK),
 'th':ParagraphStyle('th',fontName='StudyBold',fontSize=9,leading=12,textColor=white),
 'callout':ParagraphStyle('callout',fontName='StudyBold',fontSize=13,leading=20,textColor=NAVY,spaceAfter=4),
}
def clean(s):return s.replace('—','-').replace('–','-').replace('’',"'").replace('“','"').replace('”','"').replace('→',' / ')
def P(s,kind='body'):return Paragraph(html.escape(clean(s)),styles[kind])
def rich(s,kind='body'):return Paragraph(clean(s),styles[kind])
story=[]
def heading(kicker,title,description=None):
 story.extend([P(kicker.upper(),'small'),P(title,'h1')])
 if description:story.append(P(description))
def section(title,body,example=None):
 items=[P(title,'h2'),P(body)]
 if example:items.append(callout(example))
 story.append(KeepTogether(items))
def callout(text):
 t=Table([[P(text)]],colWidths=[491]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.6,LINE),('LEFTPADDING',(0,0),(-1,-1),13),('RIGHTPADDING',(0,0),(-1,-1),13),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),6)]));return t
def table(headers,rows,widths):
 t=Table([[P(x,'th')for x in headers]]+[[P(x,'table')for x in row]for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,HexColor('#f4f8f8')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),1,TEAL)]));return t

heading('Week 02 / Independent study','Vocabulary, Grammar\n& Exam Skills','A compact revision companion to the three-chapter theory class. Original examples throughout; no answers to the academy exercises.')
story.append(callout('Learn the method. Make your own decisions.'))
section('Use this guide in three passes','Before a session, retrieve five phrases without looking. During practice, use the grammar frames as a reference. After attempting the exercises, record one error pattern and create a new example.')
story.append(table(['Chapter','What to retrieve'],[
 ['01 / Vocabulary & Collocations','Precise meanings; whole phrases; verb and preposition patterns.'],
 ['02 / Grammar & Use of English','Preferences; passive meanings; agreement; contrast; polite questions.'],
 ['03 / Exam Skills & Practice','Task fulfilment; paragraph purpose; developed speech; changing intentions.']],[160,331]))
section('Your four sessions remain independent','The class is recommended, not compulsory. It does not unlock or block any session. You can continue the course and request optional AI feedback without a teacher approving your work.')
section('Make vocabulary active','Record a meaning in English, a natural phrase and one new example. Say the phrase, change part of it, then retrieve it tomorrow. A familiar translation alone is not enough to use a word accurately.')
story.append(P('Original practice material for Aptis B2 preparation. Not an official British Council publication.','small'))
story.append(PageBreak())
for page,start in enumerate([0,15]):
 heading('Vocabulary / '+('01' if page==0 else '02'),'Meanings and useful patterns','Learn the whole pattern and create a different sentence. The examples below use situations outside the weekly questions.')
 story.append(table(['Word or phrase','Meaning in English','Useful pattern'],[[g['term'],g['meaning'],g['pattern']]for g in data['glossary'][start:start+15]],[98,206,187]))
 story.append(Spacer(1,15));story.append(P('Retrieval task: cover the middle column and explain five meanings aloud. Then change the example to fit your own experience.','small'))
 story.append(PageBreak())
heading('Grammar / Four core patterns','Meaning before form','Identify who acts and what relationship you want to express. Then choose a complete grammatical frame.')
section('1 / Preferences','Same subject: would rather + base verb. Another subject: would rather + subject + past form for a present or future preference. Would prefer normally takes to + infinitive.',"I'd rather paint outdoors. I'd rather my sister drove us there. I'd prefer to travel early.")
section('2 / Necessary work','Need + -ing can have passive meaning in British English. Need + to be + past participle gives an equivalent passive. A person who performs the action can need to + base verb.','The car needs washing. The car needs to be washed. The owner needs to wash the car.')
section('3 / Neither ... nor','Both alternatives are excluded. With mixed singular and plural subjects, the nearer subject normally guides agreement. Recast awkward combinations when writing freely.','Neither the coach nor the players are ready. Neither the players nor the coach is ready.')
section('4 / Contrast','Despite and in spite of take a noun phrase or -ing form. Although takes a subject and a finite verb. Do not use despite of.','Despite the fog, the pilot landed safely. Although visibility was poor, the landing was safe.')
section('Independent practice','Make one fresh example for each rule. Do not copy a weekly question and replace only one word. Check the meaning, subject and complete structure before checking individual endings.')
story.append(PageBreak())
heading('Writing toolkit / Accurate connections','Useful language, clear purpose','These are reusable frames, not a ready-made answer to an academy task.')
story.append(table(['Pattern','New example'],[
 ['remind someone to + verb','Please remind the visitors to bring a sunhat.'],
 ['remind someone about + noun','The message reminded us about the rehearsal.'],
 ['enquire about / comply with','Enquire about membership; comply with environmental legislation.'],
 ['responsible for / in someone’s care','Responsible for feeding the birds; animals in the team’s care.'],
 ['distinguish between A and B','Distinguish between an original painting and a reproduction.'],
 ['take X into account / set priorities','Take the nesting season into account; set priorities for restoration.'],
 ['make an exception / come into effect','Make an exception to a policy; new noise rules come into effect.']],[192,299]))
section('Polite indirect questions','Use statement order inside the embedded question. Use whether or if for yes-or-no questions. Choose a clear introduction for the information you need.','Where does the trail end? / Could you tell me where the trail ends?')
section('Proposals, passives and conditions','Suggest + -ing; modal + be + past participle. Use could for an option and might for a possibility. Check that a proposal respects the notice.','I suggest displaying larger labels. Paintings must be protected from sunlight. If a guide is absent, a volunteer could lead the tour.')
section('Avoid these common errors',"Do not mix I'd rather with to + verb. Do not use needs to drying. Do not write despite of. Do not invert the embedded question after could you tell me. Do not use suggest me to when recommending an action.")
story.append(PageBreak())
heading('Exam strategy / Final check','Plan, attempt, then review','A correct method helps you make a decision. It does not replace reading the actual task carefully.')
section('Writing','Identify the reader and every requested action. Cover each content point before polishing style. Your weekly ranges are Part 2: 20-30 words; Part 3: 30-40 per response; Part 4: 40-50 informal and 120-150 formal. Follow the range printed on the actual task.')
story.append(callout('Short-answer teaching example / A neighbourhood picnic\nI would bring a board game because it is easy to share and gives neighbours who have not met before a natural way to start talking.\n26 words: an item plus a reason. Use your own idea in practice.'))
section('Reading','Skim the route of the text, label each paragraph’s job, match main ideas and review overlaps. A repeated word is not enough evidence. In the new garden example, a shift from watering to improving the soil supports a change-of-method heading.')
section('Speaking','Describe visible evidence; signal speculation with might or perhaps. Use past forms for a personal event and develop general opinions with reasons. Compare a relevant dimension rather than two isolated descriptions. Part 1: 30 seconds each; Parts 2-3: 45 seconds each; Part 4: one minute preparation and two minutes speaking.')
section('Listening','Separate the original plan, later choice and next action. In the new ferry/train example, the final transport is the train and the sister makes the booking. Academy listening is unlimited; use replay to analyse evidence. Attempt the task before consulting its transcript.')
story.append(P('Final checklist','h2'))
for line in ['I can retrieve five phrases with meanings and new examples.','I can explain four grammar patterns rather than recite answers.','My writing addresses every requested point and the correct reader.','My reading choice reflects the whole paragraph’s purpose.','My speech answers the actual prompt and develops a relevant idea.','My listening choice follows the final decision, not just the first word.']:
 story.append(P('[  ] '+line,'small'))

def decorate(c,doc):
 w,h=A4;c.setFillColor(NAVY);c.rect(0,h-32,w,32,fill=1,stroke=0);c.setFillColor(white);c.setFont('StudyBold',8);c.drawString(42,h-21,'APTIS B2 ACADEMY');c.setFont('Study',8);c.drawRightString(w-42,h-21,'WEEK 02 / REVISION GUIDE')
 c.setStrokeColor(LINE);c.line(42,34,w-42,34);c.setFillColor(MUTED);c.setFont('Study',8);c.drawString(42,21,'Original examples / Study independently');c.drawRightString(w-42,21,f'{doc.page}')
doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=52,leftMargin=52,topMargin=57,bottomMargin=50,title='Week 2 - Vocabulary, Grammar & Exam Skills',author='APTIS B2 Academy')
doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
from pypdf import PdfReader
r=PdfReader(OUT)
assert len(r.pages)==6, f'Expected six designed pages; got {len(r.pages)}'
print(f'Created {OUT} / {len(r.pages)} pages')
