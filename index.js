// Library to send signal to Q keyboards
const q = require('daskeyboard-applet');

// Library to send request to API
const request = require('request-promise');

var dateFormat = require('dateformat');

const btoa = require('btoa');

const logger = q.logger;

const baseUrl1 = 'https://';
const baseUrl2 = '.mydonedone.com/issuetracker/api/v2'

// Get the current time
function getTime() {
  var now =  new Date().getTime()/1000;
  var nowWithoutDot = `${now}`.replace('.','');
  return nowWithoutDot;
}

// Test if an object is empty
function isEmpty(obj) {
  for(var key in obj) {
      if(obj.hasOwnProperty(key))
          return false;
  }
  return true;
}


class DoneDone extends q.DesktopApp {

  constructor() {
    super();
    // run every 10 sec
    this.pollingInterval = 10 * 1000;
  }

  async applyConfig() {

    logger.info("DoneDone initialisation.")

    this.subdomain = this.config.subdomain;
    this.username = this.config.username;
    
    if(this.subdomain){

      // Create and initialize time variable
      this.now = getTime();

      this.baseUrl = baseUrl1 + this.subdomain + baseUrl2;
      this.params = `${this.config.username}:${this.authorization.apiKey}`;
      this.paramsBase64Encoded = btoa(this.params);
    
      this.serviceHeaders = {
        "Authorization": `Basic ${this.paramsBase64Encoded}`,
      }

      logger.info("This is subdomain: "+this.subdomain);
      logger.info("This is the base Url: "+this.baseUrl);

      // Get the user ID
      await request.get({
        url: `${this.baseUrl}/people/me.json`,
        headers: this.serviceHeaders,
        json: true
      }).then((body) => {
        logger.info("Let's configure the user ID.");
        logger.info("This is the body: "+ JSON.stringify(body));
        this.userId = body.id;
        logger.info("This is the userID: "+ this.userId);
      })
      .catch(error => {
        logger.error(
          `Got error sending request to service: ${JSON.stringify(error)}`);
      });
    }else{
      logger.info("Subdomain is undefined. Configuration is not done yet");
    }


  }

  // call this function every pollingInterval
  async run() {
    let signal = null;
    let triggered = false;
    let message = [];
    let url;

    try {
      const body = await request.get({
        url: `${this.baseUrl}/issues/all.json`,
        headers: this.serviceHeaders,
        json: true
      });

      logger.info("Looking for DoneDone issues");
      logger.info("This is the date " + this.now);
      logger.info("Issues response: " + JSON.stringify(body));

      // Test if there is something inside the response
      var isBodyEmpty = isEmpty(body) || (body === "[]");
      if (isBodyEmpty) {
        logger.info("Response empty when getting all issues.");
      }
      else {

        for (let issue of body.issues) {
          // extract the issues from the response
          logger.info("This is how a issue looks: " + JSON.stringify(issue));
          logger.info("CHECKING  "+issue.last_updated_on.slice(6,18));
          logger.info("NOWWW  "+this.now);

          if( (issue.last_updated_on.slice(6,18) > this.now) ){
          // if( (issue.last_updated_on.slice(6,18) > this.now) && (issue.last_updater.id != this.userId) ){
            logger.info("Get issue update");

            // Check if a signal is already set up
            // in order to change the url
            if(triggered){
              url = `https://${this.subdomain}.mydonedone.com/issuetracker`
            }else{
              url = `https://${this.subdomain}.mydonedone.com/issuetracker/projects/${issue.project.id}/issues/${issue.order_number}`
            }

            // Need to send a signal
            triggered = true;

            // Update signal's message
            message.push(`${issue.title} issue has been updated. Check ${issue.project.name} project.`);

          }
        }

        // If we need to send a signal with one or several updates.
        if(triggered){

          // Updated time
          this.now = getTime();

          // Create signal
          signal = new q.Signal({
            points: [[new q.Point(this.config.color, this.config.effect)]],
            name: "DoneDone",
            message: message.join("<br>"),
            link: {
              url: url,
              label: 'Show in DoneDone',
            }
          });

        }


        return signal;
      }
    }
    catch (error) {
      logger.error(`Got error sending request to service: ${JSON.stringify(error)}`);
      return q.Signal.error([
        'The DoneDone service returned an error. Please check your API key and account.',
        `Detail: ${error.message}`
      ]);
    }

  }

}

module.exports = {
  DoneDone: DoneDone,
};

const doneDone = new DoneDone();